-- Run after supabase_schema.sql and admin_schema.sql in Supabase SQL Editor.
BEGIN;

-- Protect the ownership relationships used by submission checks, even where
-- an older project has permissive classroom/membership policies.
CREATE OR REPLACE FUNCTION public.can_manage_classroom(classroom_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.writecheck_active() AND EXISTS (SELECT 1 FROM public."classroomTable" c
    JOIN public."userTable" u ON u.id = auth.uid()
    WHERE c.id::text = classroom_key AND c.teacher_id = u.id AND u.role = 'teacher');
$$;
DROP POLICY IF EXISTS classroom_create_scope ON public."classroomTable";
CREATE POLICY classroom_create_scope ON public."classroomTable" AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (teacher_id = auth.uid() AND (public.current_account()->>'role') = 'teacher');
DROP POLICY IF EXISTS classroom_teacher_update ON public."classroomTable";
CREATE POLICY classroom_teacher_update ON public."classroomTable"
  FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS classroom_edit_scope ON public."classroomTable";
CREATE POLICY classroom_edit_scope ON public."classroomTable" AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (public.can_manage_classroom(id::text)) WITH CHECK (teacher_id = auth.uid());
DROP POLICY IF EXISTS classroom_delete_scope ON public."classroomTable";
CREATE POLICY classroom_delete_scope ON public."classroomTable" AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS membership_create_scope ON public."classroomMembers";
CREATE POLICY membership_create_scope ON public."classroomMembers" AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (student_id = auth.uid() AND (public.current_account()->>'role') = 'student');
DROP POLICY IF EXISTS membership_update_scope ON public."classroomMembers";
CREATE POLICY membership_update_scope ON public."classroomMembers" AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS membership_delete_scope ON public."classroomMembers";
CREATE POLICY membership_delete_scope ON public."classroomMembers" AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS assignment_create_scope ON public."assignmentTable";
CREATE POLICY assignment_create_scope ON public."assignmentTable" AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (teacher_id = auth.uid() AND public.can_manage_classroom(classroom_id::text));
DROP POLICY IF EXISTS assignment_edit_scope ON public."assignmentTable";
CREATE POLICY assignment_edit_scope ON public."assignmentTable" AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (teacher_id = auth.uid() AND public.can_manage_classroom(classroom_id::text))
WITH CHECK (teacher_id = auth.uid() AND public.can_manage_classroom(classroom_id::text));
DROP POLICY IF EXISTS assignment_delete_scope ON public."assignmentTable";
CREATE POLICY assignment_delete_scope ON public."assignmentTable" AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.guard_assignment_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.id IS DISTINCT FROM OLD.id OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
      OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id)
    AND EXISTS (SELECT 1 FROM public."submissionTable" WHERE assignment_id = OLD.id) THEN
    RAISE EXCEPTION 'Assignments with submissions cannot be moved to another classroom.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_assignment_identity ON public."assignmentTable";
CREATE TRIGGER guard_assignment_identity BEFORE UPDATE ON public."assignmentTable"
FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_identity();
REVOKE ALL ON FUNCTION public.guard_assignment_identity() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.can_use_assignment(assignment_key TEXT, teacher_only BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.writecheck_active() AND EXISTS (
    SELECT 1 FROM public."assignmentTable" a
    JOIN public."classroomTable" c ON c.id = a.classroom_id
    JOIN public."userTable" u ON u.id = auth.uid()
    WHERE a.id::text = assignment_key AND a.teacher_id = c.teacher_id
      AND ((u.role = 'teacher' AND c.teacher_id = u.id)
        OR (NOT teacher_only AND u.role = 'student' AND EXISTS (
          SELECT 1 FROM public."classroomMembers" m WHERE m.classroom_id = c.id AND m.student_id = u.id)))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_submission(submission_key TEXT, teacher_only BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.writecheck_active() AND EXISTS (
    SELECT 1 FROM public."submissionTable" s
    JOIN public."assignmentTable" a ON a.id = s.assignment_id AND a.classroom_id = s.classroom_id
    JOIN public."classroomTable" c ON c.id = a.classroom_id
    JOIN public."userTable" u ON u.id = auth.uid()
    WHERE s.id::text = submission_key AND a.teacher_id = c.teacher_id
      AND ((u.role = 'teacher' AND c.teacher_id = u.id)
        OR (NOT teacher_only AND u.role = 'student' AND s.student_id = u.id))
  );
$$;

-- The server receives only records this session is authorized to access.
CREATE OR REPLACE FUNCTION public.accessible_submissions()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'assignment_id', s.assignment_id,
    'classroom_id', s.classroom_id, 'student_id', s.student_id, 'file_url', s.file_url)), '[]'::jsonb)
  FROM public."submissionTable" s WHERE public.can_access_submission(s.id::text);
$$;

ALTER TABLE public."submissionTable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS submission_read_scope ON public."submissionTable";
CREATE POLICY submission_read_scope ON public."submissionTable" AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.can_access_submission(id::text));
DROP POLICY IF EXISTS submission_insert_scope ON public."submissionTable";
CREATE POLICY submission_insert_scope ON public."submissionTable" AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (student_id = auth.uid() AND public.can_use_assignment(assignment_id::text));
DROP POLICY IF EXISTS submission_update_scope ON public."submissionTable";
CREATE POLICY submission_update_scope ON public."submissionTable" AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.can_access_submission(id::text, true)) WITH CHECK (public.can_access_submission(id::text, true));
DROP POLICY IF EXISTS submission_delete_scope ON public."submissionTable";
CREATE POLICY submission_delete_scope ON public."submissionTable" AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
-- Explicit legitimate access, bounded by all restrictive policies above.
DROP POLICY IF EXISTS submission_owner_read ON public."submissionTable";
CREATE POLICY submission_owner_read ON public."submissionTable" FOR SELECT TO authenticated USING (public.can_access_submission(id::text));
DROP POLICY IF EXISTS submission_student_insert ON public."submissionTable";
CREATE POLICY submission_student_insert ON public."submissionTable" FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND public.can_use_assignment(assignment_id::text));
DROP POLICY IF EXISTS submission_teacher_update ON public."submissionTable";
CREATE POLICY submission_teacher_update ON public."submissionTable" FOR UPDATE TO authenticated USING (public.can_access_submission(id::text, true));

CREATE OR REPLACE FUNCTION public.guard_submission_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data JSONB := to_jsonb(NEW);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."assignmentTable" a WHERE a.id = NEW.assignment_id AND a.classroom_id = NEW.classroom_id) THEN
    RAISE EXCEPTION 'Assignment does not belong to this classroom.' USING ERRCODE = '23514';
  END IF;
  IF auth.role() IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NOT public.writecheck_active() OR NEW.student_id IS DISTINCT FROM auth.uid()
        OR NOT public.can_use_assignment(NEW.assignment_id::text)
        OR NOT EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND role = 'student') THEN
        RAISE EXCEPTION 'Only enrolled students can submit their own work.' USING ERRCODE = '42501';
      END IF;
      IF COALESCE(row_data->>'grade','') <> '' OR COALESCE(row_data->>'feedback','') <> ''
        OR COALESCE(row_data->>'transcribed_text','') <> ''
        OR COALESCE(row_data->'scan_result','null'::jsonb) NOT IN ('null'::jsonb,'{}'::jsonb)
        OR COALESCE(row_data->>'plagiarism_score','') <> ''
        OR COALESCE(row_data->>'status','submitted') <> 'submitted' THEN
        RAISE EXCEPTION 'Students cannot supply grades or scan results.' USING ERRCODE = '42501';
      END IF;
      -- Upload paths are scoped to the student and assignment. Legacy files remain readable.
      IF NEW.file_url IS NULL OR NOT (NEW.file_url LIKE NEW.student_id::text || '/' || NEW.assignment_id::text || '/%'
        OR NEW.file_url LIKE '%/uploads/submissions/' || NEW.student_id::text || '/' || NEW.assignment_id::text || '/%')
        OR NEW.file_url LIKE '%..%' THEN
        RAISE EXCEPTION 'Invalid submission file path.' USING ERRCODE = '42501';
      END IF;
      NEW.created_at := now();
    ELSE
      IF NOT public.can_access_submission(OLD.id::text, true) THEN
        RAISE EXCEPTION 'Only the classroom teacher can update results.' USING ERRCODE = '42501';
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.student_id IS DISTINCT FROM OLD.student_id
        OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
        OR NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.essay_title IS DISTINCT FROM OLD.essay_title THEN
        RAISE EXCEPTION 'Submission identity and original work cannot be changed.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_submission_fields ON public."submissionTable";
CREATE TRIGGER guard_submission_fields BEFORE INSERT OR UPDATE ON public."submissionTable"
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_fields();

-- Bound cloud copies too; browser clients cannot fabricate scan/grade records.
DROP POLICY IF EXISTS scan_owner_scope ON public.plagiarism_scans;
CREATE POLICY scan_owner_scope ON public.plagiarism_scans AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (user_id = auth.uid()::text);
DROP POLICY IF EXISTS grade_owner_scope ON public.submission_grades;
CREATE POLICY grade_owner_scope ON public.submission_grades AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.can_access_submission(submission_id));
DO $$ DECLARE t TEXT; operation TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['plagiarism_scans','submission_grades'] LOOP
    FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'server_only_' || lower(operation), t);
      IF operation = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false)', 'server_only_insert', t);
      ELSIF operation = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false)', 'server_only_update', t);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)', 'server_only_delete', t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_essay_file(file_key TEXT, writing BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.writecheck_active() AND (
    (split_part(file_key,'/',1) = auth.uid()::text AND public.can_use_assignment(split_part(file_key,'/',2))
      AND EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND role = 'student')
      AND (NOT writing OR NOT EXISTS (SELECT 1 FROM public."submissionTable" s WHERE s.file_url = file_key)))
    OR (NOT writing AND EXISTS (SELECT 1 FROM public."submissionTable" s
      WHERE public.can_access_submission(s.id::text) AND (s.file_url = file_key
        OR right(split_part(s.file_url,'?',1), length('/essay-submissions/' || file_key)) = '/essay-submissions/' || file_key)))
  );
$$;
DROP POLICY IF EXISTS essay_file_read_scope ON storage.objects;
CREATE POLICY essay_file_read_scope ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (bucket_id <> 'essay-submissions' OR public.can_access_essay_file(name));
DROP POLICY IF EXISTS essay_file_insert_scope ON storage.objects;
CREATE POLICY essay_file_insert_scope ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id <> 'essay-submissions' OR public.can_access_essay_file(name,true));
DROP POLICY IF EXISTS essay_file_update_scope ON storage.objects;
CREATE POLICY essay_file_update_scope ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (bucket_id <> 'essay-submissions' OR public.can_access_essay_file(name,true))
WITH CHECK (bucket_id <> 'essay-submissions' OR public.can_access_essay_file(name,true));
DROP POLICY IF EXISTS essay_file_delete_scope ON storage.objects;
CREATE POLICY essay_file_delete_scope ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
USING (bucket_id <> 'essay-submissions' OR public.can_access_essay_file(name,true));
UPDATE storage.buckets SET public = false WHERE id = 'essay-submissions';

REVOKE ALL ON FUNCTION public.accessible_submissions(), public.can_use_assignment(TEXT,BOOLEAN),
 public.can_access_submission(TEXT,BOOLEAN), public.can_manage_classroom(TEXT), public.can_access_essay_file(TEXT,BOOLEAN), public.guard_submission_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accessible_submissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_assignment(TEXT,BOOLEAN), public.can_access_submission(TEXT,BOOLEAN),
 public.can_manage_classroom(TEXT), public.can_access_essay_file(TEXT,BOOLEAN) TO authenticated, anon;
COMMIT;
