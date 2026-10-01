-- Apply after classroom_management.sql and the existing submission security migrations.
-- New table required: no existing assignment comment storage was present.
BEGIN;
CREATE TABLE IF NOT EXISTS public.assignment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public."assignmentTable"(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES public."classroomTable"(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public."userTable"(id),
  comment_text TEXT NOT NULL CHECK (length(trim(comment_text)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignment_comments_scope_idx ON public.assignment_comments(classroom_id, assignment_id, created_at);
ALTER TABLE public.assignment_comments ENABLE ROW LEVEL SECURITY;
-- Access goes through the checked RPCs only, so callers cannot spoof identities or dates.
REVOKE ALL ON public.assignment_comments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_assignment_comment_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."assignmentTable" a WHERE a.id = NEW.assignment_id AND a.classroom_id = NEW.classroom_id) THEN
    RAISE EXCEPTION 'Comment assignment does not belong to this classroom.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_assignment_comment_scope ON public.assignment_comments;
CREATE TRIGGER guard_assignment_comment_scope BEFORE INSERT OR UPDATE ON public.assignment_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_comment_scope();

CREATE OR REPLACE FUNCTION public.list_assignment_comments(requested_assignment_id TEXT, requested_classroom_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.can_use_assignment(requested_assignment_id) OR NOT EXISTS (
    SELECT 1 FROM public."assignmentTable" WHERE id::text = requested_assignment_id AND classroom_id::text = requested_classroom_id
  ) THEN
    RAISE EXCEPTION 'Assignment access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'student_name', u.full_name,
    'comment_text', c.comment_text, 'created_at', c.created_at) ORDER BY c.created_at, c.id), '[]'::jsonb)
    FROM public.assignment_comments c JOIN public."userTable" u ON u.id = c.student_id
    WHERE c.assignment_id::text = requested_assignment_id AND c.classroom_id::text = requested_classroom_id
      AND (c.student_id = auth.uid() OR public.can_manage_classroom(requested_classroom_id)));
END;
$$;

CREATE OR REPLACE FUNCTION public.post_assignment_comment(requested_assignment_id TEXT, requested_classroom_id TEXT, comment_text TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE comment_id UUID;
BEGIN
  IF NOT public.can_use_assignment(requested_assignment_id) OR NOT EXISTS (
    SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND role = 'student'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."assignmentTable" WHERE id::text = requested_assignment_id AND classroom_id::text = requested_classroom_id
  ) THEN
    RAISE EXCEPTION 'Only enrolled students can comment on this assignment.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.assignment_comments(assignment_id, classroom_id, student_id, comment_text)
    SELECT a.id, a.classroom_id, auth.uid(), trim(post_assignment_comment.comment_text)
    FROM public."assignmentTable" a WHERE a.id::text = requested_assignment_id
    RETURNING id INTO comment_id;
  RETURN comment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_assignment_comment_scope(), public.list_assignment_comments(TEXT,TEXT), public.post_assignment_comment(TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignment_comments(TEXT,TEXT), public.post_assignment_comment(TEXT,TEXT,TEXT) TO authenticated;

-- Scope the existing archive API to the verified account, including student enrollment.
CREATE OR REPLACE FUNCTION public.list_my_archived_classrooms()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id)), '[]'::jsonb)
  FROM public."classroomTable" c
  WHERE c.is_archived AND public.writecheck_active() AND (
    public.can_manage_classroom(c.id::text) OR EXISTS (
      SELECT 1 FROM public."classroomMembers" m JOIN public."userTable" u ON u.id = m.student_id
      WHERE m.classroom_id = c.id AND m.student_id = auth.uid() AND u.role = 'student'
    )
  );
$$;
REVOKE ALL ON FUNCTION public.list_my_archived_classrooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_archived_classrooms() TO authenticated;

-- Enables immediate archive/restore updates for connected student workspaces.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'classroomTable') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."classroomTable";
  END IF;
END $$;
COMMIT;
