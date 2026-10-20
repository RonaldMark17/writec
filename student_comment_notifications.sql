-- Apply after comment_visibility.sql and in_app_notifications.sql, before the new frontend.
BEGIN;
ALTER TABLE public.assignment_comments ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS assignment_comments_client_request ON public.assignment_comments(sender_id, client_request_id) WHERE client_request_id IS NOT NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'assignment_created','assignment_updated','resubmission_requested','grade_posted','feedback_added',
  'submission_created','submission_resubmitted','student_class_comment','student_private_comment'));

-- Comment events remain visible only while the recipient is the authorized teacher.
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated
  USING (public.can_read_notification(recipient_user_id, classroom_id)
    AND (type NOT IN ('student_class_comment','student_private_comment') OR public.can_manage_classroom(classroom_id)));

CREATE OR REPLACE FUNCTION public.notify_student_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient UUID; class_name TEXT; assignment_title TEXT; student_name TEXT; kind TEXT;
BEGIN
  SELECT c.teacher_id,c.classroom_name,a.title,u.full_name
    INTO recipient,class_name,assignment_title,student_name
    FROM public."classroomTable" c JOIN public."assignmentTable" a ON a.classroom_id = c.id
    JOIN public."userTable" u ON u.id = NEW.sender_id
    WHERE c.id = NEW.classroom_id AND a.id = NEW.assignment_id AND u.role = 'student'
      AND u.id = NEW.student_id AND c.teacher_id <> u.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  kind := CASE WHEN NEW.visibility = 'class' THEN 'student_class_comment' ELSE 'student_private_comment' END;
  INSERT INTO public.notifications(recipient_user_id,type,title,message,classroom_id,assignment_id,metadata,event_key)
    VALUES(recipient,kind,CASE WHEN NEW.visibility = 'class' THEN 'New class comment' ELSE 'New private comment' END,
      COALESCE(NULLIF(student_name,''),'Student') || CASE WHEN NEW.visibility = 'class' THEN ' commented on "' ELSE ' sent you a private comment on "' END || assignment_title || '".',
      NEW.classroom_id::text,NEW.assignment_id::text,
      jsonb_build_object('sender_id',NEW.sender_id,'student_id',NEW.student_id,'student_name',student_name,
        'classroom_name',class_name,'assignment_title',assignment_title,'comment_id',NEW.id,'visibility',NEW.visibility),
      kind || ':' || NEW.id::text)
    ON CONFLICT (recipient_user_id,event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_student_comment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS notify_student_comment ON public.assignment_comments;
CREATE TRIGGER notify_student_comment AFTER INSERT ON public.assignment_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_student_comment();
DROP FUNCTION IF EXISTS public.post_assignment_comment(TEXT,TEXT,TEXT,TEXT,TEXT);
CREATE OR REPLACE FUNCTION public.post_assignment_comment(requested_assignment_id TEXT, requested_classroom_id TEXT,
  comment_text TEXT, comment_kind TEXT DEFAULT 'private', recipient_student_id TEXT DEFAULT NULL, request_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE comment_id UUID; student_key UUID;
BEGIN
  IF NOT public.can_use_assignment(requested_assignment_id) OR NOT EXISTS (
    SELECT 1 FROM public."assignmentTable" WHERE id::text = requested_assignment_id AND classroom_id::text = requested_classroom_id
  ) THEN RAISE EXCEPTION 'Assignment access denied.' USING ERRCODE = '42501'; END IF;
  IF comment_kind IS NULL OR comment_kind NOT IN ('class', 'private') THEN RAISE EXCEPTION 'Invalid comment type.'; END IF;
  IF public.can_manage_classroom(requested_classroom_id) THEN
    IF comment_kind <> 'private' THEN RAISE EXCEPTION 'Select a student for a private reply.'; END IF;
    SELECT u.id INTO student_key FROM public."classroomMembers" m JOIN public."userTable" u ON u.id = m.student_id
      WHERE m.classroom_id::text = requested_classroom_id AND u.id::text = recipient_student_id AND u.role = 'student';
    IF student_key IS NULL THEN RAISE EXCEPTION 'Student is not enrolled in this classroom.' USING ERRCODE = '42501'; END IF;
  ELSE
    student_key := auth.uid();
    IF NOT EXISTS (SELECT 1 FROM public."userTable" WHERE id = student_key AND role = 'student')
      OR (recipient_student_id IS NOT NULL AND recipient_student_id <> student_key::text) THEN
      RAISE EXCEPTION 'Cannot post for another student.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF request_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || request_id::text, 0));
    SELECT id INTO comment_id FROM public.assignment_comments
      WHERE sender_id = auth.uid() AND client_request_id = request_id;
    IF FOUND THEN
      IF NOT EXISTS (SELECT 1 FROM public.assignment_comments c WHERE c.id = comment_id
        AND c.assignment_id::text = requested_assignment_id AND c.classroom_id::text = requested_classroom_id
        AND c.student_id = student_key AND c.visibility = comment_kind
        AND c.comment_text = trim(post_assignment_comment.comment_text)) THEN
        RAISE EXCEPTION 'Comment retry does not match the original request.';
      END IF;
      RETURN comment_id;
    END IF;
  END IF;
  INSERT INTO public.assignment_comments(assignment_id, classroom_id, student_id, sender_id, visibility, comment_text, client_request_id)
    SELECT a.id, a.classroom_id, student_key, auth.uid(), comment_kind, trim(post_assignment_comment.comment_text), request_id
    FROM public."assignmentTable" a WHERE a.id::text = requested_assignment_id RETURNING id INTO comment_id;
  RETURN comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_assignment_comment(TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_assignment_comment(TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
COMMIT;
