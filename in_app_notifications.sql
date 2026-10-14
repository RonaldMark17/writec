-- Apply after submission_revisions.sql and submission_provenance.sql.
-- Transactional, server-generated events; no email or historical backfill.
BEGIN;
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public."userTable"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('assignment_created','assignment_updated','resubmission_requested','grade_posted','feedback_added','submission_created','submission_resubmitted')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  classroom_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  submission_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  event_key TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipient_user_id, event_key)
);
CREATE INDEX IF NOT EXISTS notifications_recent ON public.notifications(recipient_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON public.notifications(recipient_user_id) WHERE NOT is_read;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Recheck current classroom access, including after leaving or ownership changes.
CREATE OR REPLACE FUNCTION public.can_read_notification(recipient UUID, classroom TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT recipient = auth.uid() AND public.writecheck_active() AND EXISTS (
    SELECT 1 FROM public."classroomTable" c WHERE c.id::text = classroom
      AND (c.teacher_id = auth.uid() OR EXISTS (SELECT 1 FROM public."classroomMembers" m
        WHERE m.classroom_id = c.id AND m.student_id = auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_notification(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_notification(UUID,TEXT) TO authenticated;
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated
  USING (public.can_read_notification(recipient_user_id, classroom_id));

-- No direct UPDATE grant: even the owner cannot forge content or change recipients.
CREATE OR REPLACE FUNCTION public.mark_notifications_read(notification_key UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  UPDATE public.notifications SET is_read = true, read_at = now()
    WHERE NOT is_read AND (notification_key IS NULL OR id = notification_key)
      AND public.can_read_notification(recipient_user_id, classroom_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_assignment_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE kind TEXT; event TEXT; class_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.title,NEW.instructions,NEW.due_date) IS NOT DISTINCT FROM ROW(OLD.title,OLD.instructions,OLD.due_date) THEN RETURN NEW; END IF;
    kind := 'assignment_updated';
    -- A new key per actual row transition, never per API attempt.
    event := kind || ':' || NEW.id::text || ':' || gen_random_uuid()::text;
  ELSE
    kind := 'assignment_created'; event := kind || ':' || NEW.id::text;
  END IF;
  SELECT classroom_name INTO class_name FROM public."classroomTable" WHERE id = NEW.classroom_id;
  INSERT INTO public.notifications(recipient_user_id,type,title,message,classroom_id,assignment_id,metadata,event_key)
  SELECT DISTINCT m.student_id, kind,
    CASE WHEN kind = 'assignment_created' THEN 'New assignment' ELSE 'Assignment updated' END,
    '"' || NEW.title || '" ' || CASE WHEN kind = 'assignment_created' THEN 'was posted.' ELSE 'has updated details.' END,
    NEW.classroom_id::text, NEW.id::text,
    jsonb_build_object('classroom_name',class_name,'due_date',NEW.due_date), event
  FROM public."classroomMembers" m JOIN public."userTable" u ON u.id = m.student_id
  WHERE m.classroom_id = NEW.classroom_id AND u.role = 'student' AND u.account_status = 'active'
    AND m.student_id IS DISTINCT FROM NEW.teacher_id
  ON CONFLICT (recipient_user_id,event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_assignment_event ON public."assignmentTable";
CREATE TRIGGER notify_assignment_event AFTER INSERT OR UPDATE ON public."assignmentTable"
  FOR EACH ROW EXECUTE FUNCTION public.notify_assignment_event();

CREATE OR REPLACE FUNCTION public.notify_submission_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient UUID; kind TEXT; heading TEXT; body TEXT; event TEXT;
  class_name TEXT; assignment_title TEXT; student_name TEXT;
BEGIN
  SELECT c.teacher_id,c.classroom_name,a.title INTO recipient,class_name,assignment_title
    FROM public."classroomTable" c JOIN public."assignmentTable" a ON a.classroom_id = c.id
    WHERE c.id = NEW.classroom_id AND a.id = NEW.assignment_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF recipient = NEW.student_id OR NOT EXISTS (SELECT 1 FROM public."classroomMembers"
      WHERE classroom_id = NEW.classroom_id AND student_id = NEW.student_id) THEN RETURN NEW; END IF;
    SELECT full_name INTO student_name FROM public."userTable" WHERE id = NEW.student_id;
    kind := 'submission_created'; heading := 'New submission';
    body := COALESCE(NULLIF(student_name,''),'Student') || ' submitted "' || assignment_title || '".';
    event := kind || ':' || NEW.id::text;
  ELSE
    IF NEW.returned_at IS NULL OR NEW.returned_at IS NOT DISTINCT FROM OLD.returned_at
      OR NOT public.submission_report_verified(NEW.id::text) THEN RETURN NEW; END IF;
    recipient := NEW.student_id;
    kind := 'grade_posted';
    heading := CASE WHEN NULLIF(trim(NEW.feedback),'') IS NOT NULL THEN 'Grade and feedback available' ELSE 'Grade posted' END;
    body := 'Your instructor returned "' || assignment_title || '". View your grade and any feedback.';
    event := kind || ':' || NEW.id::text || ':' || NEW.returned_at::text;
  END IF;
  INSERT INTO public.notifications(recipient_user_id,type,title,message,classroom_id,assignment_id,submission_id,metadata,event_key)
    VALUES(recipient,kind,heading,body,NEW.classroom_id::text,NEW.assignment_id::text,NEW.id::text,
      jsonb_build_object('classroom_name',class_name),event)
    ON CONFLICT (recipient_user_id,event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_submission_event ON public."submissionTable";
CREATE TRIGGER notify_submission_event AFTER INSERT OR UPDATE ON public."submissionTable"
  FOR EACH ROW EXECUTE FUNCTION public.notify_submission_event();

CREATE OR REPLACE FUNCTION public.notify_revision_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public."submissionTable"%ROWTYPE; recipient UUID; kind TEXT; heading TEXT;
  class_name TEXT; assignment_title TEXT; body TEXT; student_name TEXT;
BEGIN
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = NEW.submission_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT c.teacher_id,c.classroom_name,a.title INTO recipient,class_name,assignment_title
    FROM public."classroomTable" c JOIN public."assignmentTable" a ON a.classroom_id = c.id
    WHERE c.id = s.classroom_id AND a.id = s.assignment_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    recipient := s.student_id; kind := 'resubmission_requested'; heading := 'Resubmission requested';
    body := 'Action required: your instructor requested a new submission for "' || assignment_title || '". Open the assignment to read the teacher note.';
  ELSE
    IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL THEN RETURN NEW; END IF;
    kind := 'submission_resubmitted'; heading := 'Assignment resubmitted';
    SELECT full_name INTO student_name FROM public."userTable" WHERE id = s.student_id;
    body := COALESCE(NULLIF(student_name,''),'Student') || ' resubmitted "' || assignment_title || '".';
    IF recipient = s.student_id THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.notifications(recipient_user_id,type,title,message,classroom_id,assignment_id,submission_id,metadata,event_key)
    VALUES(recipient,kind,heading,body,s.classroom_id::text,s.assignment_id::text,s.id::text,
      jsonb_build_object('classroom_name',class_name,'revision_request_id',NEW.id),kind || ':' || NEW.id::text)
    ON CONFLICT (recipient_user_id,event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_revision_event ON public.submission_revisions;
CREATE TRIGGER notify_revision_event AFTER INSERT OR UPDATE ON public.submission_revisions
  FOR EACH ROW EXECUTE FUNCTION public.notify_revision_event();
REVOKE ALL ON FUNCTION public.notify_assignment_event(),public.notify_submission_event(),public.notify_revision_event() FROM PUBLIC, anon, authenticated;
COMMIT;
