-- Apply after assignment_comments.sql. Existing comments stay private.
BEGIN;
ALTER TABLE public.assignment_comments ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('class', 'private'));
ALTER TABLE public.assignment_comments ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public."userTable"(id);
UPDATE public.assignment_comments SET sender_id = student_id WHERE sender_id IS NULL;
ALTER TABLE public.assignment_comments ALTER COLUMN sender_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.list_assignment_comments(requested_assignment_id TEXT, requested_classroom_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.can_use_assignment(requested_assignment_id) OR NOT EXISTS (
    SELECT 1 FROM public."assignmentTable" WHERE id::text = requested_assignment_id AND classroom_id::text = requested_classroom_id
  ) THEN RAISE EXCEPTION 'Assignment access denied.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'student_id', c.student_id,
    'student_name', sender.full_name, 'sender_name', sender.full_name, 'sender_id', c.sender_id,
    'visibility', c.visibility, 'comment_text', c.comment_text, 'created_at', c.created_at,
    'recipient_name', recipient.full_name) ORDER BY c.created_at, c.id), '[]'::jsonb)
    FROM public.assignment_comments c JOIN public."userTable" sender ON sender.id = c.sender_id
    JOIN public."userTable" recipient ON recipient.id = c.student_id
    WHERE c.assignment_id::text = requested_assignment_id AND c.classroom_id::text = requested_classroom_id
      AND (c.visibility = 'class' OR c.student_id = auth.uid() OR public.can_manage_classroom(requested_classroom_id)));
END;
$$;
DROP FUNCTION IF EXISTS public.post_assignment_comment(TEXT,TEXT,TEXT);
CREATE OR REPLACE FUNCTION public.post_assignment_comment(requested_assignment_id TEXT, requested_classroom_id TEXT,
  comment_text TEXT, comment_kind TEXT DEFAULT 'private', recipient_student_id TEXT DEFAULT NULL)
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
  INSERT INTO public.assignment_comments(assignment_id, classroom_id, student_id, sender_id, visibility, comment_text)
    SELECT a.id, a.classroom_id, student_key, auth.uid(), comment_kind, trim(post_assignment_comment.comment_text)
    FROM public."assignmentTable" a WHERE a.id::text = requested_assignment_id RETURNING id INTO comment_id;
  RETURN comment_id;
END;
$$;
REVOKE ALL ON public.assignment_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_assignment_comment(TEXT,TEXT,TEXT,TEXT,TEXT), public.list_assignment_comments(TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_assignment_comment(TEXT,TEXT,TEXT,TEXT,TEXT), public.list_assignment_comments(TEXT,TEXT) TO authenticated;
COMMIT;
