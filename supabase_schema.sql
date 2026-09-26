-- ==============================================================================
-- WriteCheck Supabase Schema for Plagiarism & Handwriting Detection
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 0. Add late submission toggle column to assignmentTable
ALTER TABLE IF EXISTS public."assignmentTable"
  ADD COLUMN IF NOT EXISTS accept_late_submissions BOOLEAN NOT NULL DEFAULT true;

-- 1. Enhance existing 'submissionTable' with OCR and Plagiarism Columns
ALTER TABLE IF EXISTS public."submissionTable"
  ADD COLUMN IF NOT EXISTS transcribed_text TEXT,
  ADD COLUMN IF NOT EXISTS scan_result JSONB,
  ADD COLUMN IF NOT EXISTS plagiarism_score NUMERIC;

-- 2. Create dedicated 'plagiarism_scans' table (mirroring plagiarism.db)
CREATE TABLE IF NOT EXISTS public.plagiarism_scans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    scan_id TEXT NOT NULL UNIQUE,
    filename TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total_words INTEGER DEFAULT 0,
    plagiarism_score NUMERIC DEFAULT 0.0,
    identical_words INTEGER DEFAULT 0,
    result_data JSONB DEFAULT '{}'::jsonb,
    submitted_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for fast scan retrieval
CREATE INDEX IF NOT EXISTS idx_plagiarism_scans_scan_id ON public.plagiarism_scans(scan_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_scans_user_id ON public.plagiarism_scans(user_id);

-- 3. Create dedicated 'submission_grades' table (mirroring plagiarism.db)
CREATE TABLE IF NOT EXISTS public.submission_grades (
    submission_id TEXT PRIMARY KEY,
    grade TEXT,
    feedback TEXT,
    status TEXT DEFAULT 'graded',
    transcribed_text TEXT,
    scan_result JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Configure Row Level Security (RLS) policies
ALTER TABLE public.plagiarism_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_grades ENABLE ROW LEVEL SECURITY;

-- Allow public / authenticated read and write access for seamless sync
DROP POLICY IF EXISTS "Enable all operations for plagiarism_scans" ON public.plagiarism_scans;
CREATE POLICY "Enable all operations for plagiarism_scans"
    ON public.plagiarism_scans
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all operations for submission_grades" ON public.submission_grades;
CREATE POLICY "Enable all operations for submission_grades"
    ON public.submission_grades
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Ensure permission grants to anon and authenticated roles
GRANT ALL ON TABLE public.plagiarism_scans TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.submission_grades TO anon, authenticated, service_role;
GRANT ALL ON TABLE public."submissionTable" TO anon, authenticated, service_role;

-- 5. Allow teachers to update their own assignments
-- The frontend uses Supabase directly for assignment edits. Without an UPDATE
-- policy, Supabase can return no error while changing zero rows.
ALTER TABLE IF EXISTS public."assignmentTable" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers can update their own assignments"
  ON public."assignmentTable";
CREATE POLICY "Teachers can update their own assignments"
  ON public."assignmentTable"
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

GRANT UPDATE ON TABLE public."assignmentTable" TO authenticated;

-- 6. Share only enrolled students' names with the class owner and classmates.
-- SECURITY DEFINER avoids recursive membership RLS checks without granting
-- students access to classmates' full profiles, emails, or submissions.
CREATE OR REPLACE FUNCTION public.get_classroom_roster(requested_classroom_id TEXT)
RETURNS TABLE (student_id TEXT, student_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public."classroomTable" c
    WHERE c.id::text = requested_classroom_id
      AND (c.teacher_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public."classroomMembers" own_membership
        WHERE own_membership.classroom_id = c.id
          AND own_membership.student_id = auth.uid()
      ))
  ) THEN
    RAISE EXCEPTION 'You do not have access to this classroom.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT m.student_id::text,
      COALESCE(NULLIF(TRIM(u.full_name), ''), 'Student')::text AS student_name
    FROM public."classroomMembers" m
    LEFT JOIN public."userTable" u ON u.id = m.student_id
    WHERE m.classroom_id::text = requested_classroom_id
    ORDER BY student_name, m.student_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_classroom_roster(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classroom_roster(TEXT) TO authenticated;

-- 7. Allow either workspace to edit only its own display name.
CREATE OR REPLACE FUNCTION public.update_my_profile(new_full_name TEXT)
RETURNS TABLE (full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to edit your profile.' USING ERRCODE = '42501';
  END IF;
  IF new_full_name IS NULL OR length(trim(new_full_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Enter a name between 1 and 120 characters.';
  END IF;
  RETURN QUERY
    UPDATE public."userTable" AS u
    SET full_name = trim(new_full_name)
    WHERE u.id = auth.uid()
    RETURNING u.full_name::text;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_profile(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT) TO authenticated;

-- 8. Store the assigned teacher's display name and email alongside teacher_id.
-- teacher_id remains the identity used for ownership and permissions.
BEGIN;

ALTER TABLE public."classroomTable"
  ADD COLUMN IF NOT EXISTS teacher_name TEXT,
  ADD COLUMN IF NOT EXISTS teacher_email TEXT;

CREATE OR REPLACE FUNCTION public.set_classroom_teacher_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT u.full_name, u.email
  INTO NEW.teacher_name, NEW.teacher_email
  FROM public."userTable" u
  WHERE u.id = NEW.teacher_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_classroom_teacher_name ON public."classroomTable";
CREATE TRIGGER set_classroom_teacher_name
BEFORE INSERT OR UPDATE OF teacher_id, teacher_name, teacher_email
ON public."classroomTable"
FOR EACH ROW EXECUTE FUNCTION public.set_classroom_teacher_name();

CREATE OR REPLACE FUNCTION public.sync_teacher_name_to_classrooms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public."classroomTable"
  SET teacher_name = NEW.full_name,
      teacher_email = NEW.email
  WHERE teacher_id = NEW.id
    AND (teacher_name IS DISTINCT FROM NEW.full_name OR teacher_email IS DISTINCT FROM NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_teacher_name_to_classrooms ON public."userTable";
CREATE TRIGGER sync_teacher_name_to_classrooms
AFTER INSERT OR UPDATE OF full_name, email
ON public."userTable"
FOR EACH ROW EXECUTE FUNCTION public.sync_teacher_name_to_classrooms();

REVOKE ALL ON FUNCTION public.set_classroom_teacher_name() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_teacher_name_to_classrooms() FROM PUBLIC, anon, authenticated;

-- Populate existing classrooms; the trigger resolves each teacher's name & email.
UPDATE public."classroomTable" SET teacher_name = NULL;

-- 9. Allow enrolled students and authenticated users to read teacher profiles (name, email)
DROP POLICY IF EXISTS "teachers_readable_by_authenticated" ON public."userTable";
CREATE POLICY "teachers_readable_by_authenticated" ON public."userTable"
  FOR SELECT TO authenticated
  USING (role = 'teacher' OR id = auth.uid());

-- 10. Add is_archived column to classroomTable for archiving classrooms
ALTER TABLE public."classroomTable"
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

COMMIT;
