-- Apply after assignment_comments.sql, comment_visibility.sql, in_app_notifications.sql,
-- submission_revisions.sql and submission_match_evidence.sql. No schema/data rewrite.
-- Direct table DELETE remains forbidden by submission_security.sql.
BEGIN;

-- Some older base schemas omit this FK. Enforce the known assignment/submission
-- relationship so concurrent uploads cannot recreate orphaned work after delete.
-- Validation fails (without changing data) if existing orphaned rows need repair.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_attribute child ON child.attrelid = fk.conrelid AND child.attname = 'assignment_id'
    JOIN pg_catalog.pg_attribute parent ON parent.attrelid = fk.confrelid AND parent.attname = 'id'
    WHERE fk.contype = 'f' AND fk.conrelid = 'public."submissionTable"'::regclass
      AND fk.confrelid = 'public."assignmentTable"'::regclass
      AND fk.conkey = ARRAY[child.attnum] AND fk.confkey = ARRAY[parent.attnum] AND fk.convalidated
  ) THEN
    ALTER TABLE public."submissionTable" ADD CONSTRAINT submission_assignment_delete_integrity
      FOREIGN KEY (assignment_id) REFERENCES public."assignmentTable"(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assignment_deletion_preview(assignment_key TEXT, classroom_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public."assignmentTable"%ROWTYPE; c public."classroomTable"%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_classroom(classroom_key) THEN
    RAISE EXCEPTION 'Assignment deletion is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public."assignmentTable"
    WHERE id::text = assignment_key AND classroom_id::text = classroom_key AND teacher_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment deletion is not authorized.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public."classroomTable" WHERE id = a.classroom_id;
  RETURN jsonb_build_object('id', a.id, 'classroomId', a.classroom_id, 'title', a.title,
    'classroomName', c.classroom_name, 'classroomSection', c.section, 'dueDate', a.due_date,
    'students', (SELECT count(*) FROM public."classroomMembers" WHERE classroom_id = a.classroom_id),
    'submissions', (SELECT count(*) FROM public."submissionTable" WHERE assignment_id = a.id),
    'graded', (SELECT count(*) FROM public."submissionTable" WHERE assignment_id = a.id AND nullif(btrim(grade::text), '') IS NOT NULL),
    'comments', (SELECT count(*) FROM public.assignment_comments WHERE assignment_id = a.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_assignment_confirmed(
  assignment_key TEXT, classroom_key TEXT, confirmation_title TEXT, acknowledged BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public."assignmentTable"%ROWTYPE; submission_keys TEXT[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_classroom(classroom_key) THEN
    RAISE EXCEPTION 'Assignment deletion is not authorized.' USING ERRCODE = '42501';
  END IF;
  -- Stabilize owner and assignment identity through the entire transaction.
  PERFORM 1 FROM public."classroomTable" WHERE id::text = classroom_key AND teacher_id = auth.uid() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment deletion is not authorized.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public."assignmentTable"
    WHERE id::text = assignment_key AND classroom_id::text = classroom_key AND teacher_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment deletion is not authorized.' USING ERRCODE = '42501'; END IF;
  IF acknowledged IS DISTINCT FROM true OR confirmation_title IS NULL
    OR btrim(confirmation_title) IS DISTINCT FROM a.title THEN
    RAISE EXCEPTION 'Enter the exact assignment title and acknowledge deletion.' USING ERRCODE = '22023';
  END IF;

  -- Fail closed if a deployment has extra foreign-key relationships. Never follow
  -- an unreviewed cascade into classrooms, other assignments or custom tables.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint fk
    WHERE fk.contype = 'f' AND fk.confrelid IN (
      'public."assignmentTable"'::regclass, 'public."submissionTable"'::regclass,
      'public.assignment_comments'::regclass, 'public.submission_jobs'::regclass,
      'public.submission_match_evidence'::regclass, 'public.submission_revisions'::regclass,
      'public.submission_grades'::regclass, 'public.notifications'::regclass)
    AND NOT EXISTS (
      SELECT 1 FROM (VALUES
        ('public."assignmentTable"'::regclass, 'public."submissionTable"'::regclass, 'assignment_id'),
        ('public."assignmentTable"'::regclass, 'public.assignment_comments'::regclass, 'assignment_id'),
        ('public."submissionTable"'::regclass, 'public.submission_jobs'::regclass, 'submission_id'),
        ('public."submissionTable"'::regclass, 'public.submission_revisions'::regclass, 'submission_id'),
        ('public."submissionTable"'::regclass, 'public.submission_grades'::regclass, 'submission_id'),
        ('public.submission_jobs'::regclass, 'public.submission_match_evidence'::regclass, 'job_id')
      ) AS allowed(parent_id, child_id, child_column)
      JOIN pg_catalog.pg_attribute child ON child.attrelid = allowed.child_id AND child.attname = allowed.child_column
      JOIN pg_catalog.pg_attribute parent ON parent.attrelid = allowed.parent_id AND parent.attname = 'id'
      WHERE fk.confrelid = allowed.parent_id AND fk.conrelid = allowed.child_id
        AND fk.conkey = ARRAY[child.attnum] AND fk.confkey = ARRAY[parent.attnum]
    )
  ) THEN
    RAISE EXCEPTION 'Deletion is unavailable until additional database relationships are reviewed.' USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM public."submissionTable" WHERE assignment_id = a.id FOR UPDATE;
  SELECT coalesce(array_agg(id::text), ARRAY[]::text[]) INTO submission_keys
    FROM public."submissionTable" WHERE assignment_id = a.id;
  PERFORM 1 FROM public.submission_jobs WHERE submission_id = ANY(submission_keys) FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.submission_jobs WHERE submission_id = ANY(submission_keys) AND state IN ('submitted','processing')) THEN
    RAISE EXCEPTION 'Wait for assignment submissions to finish processing before deleting.' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public.submission_match_evidence WHERE job_id IN
    (SELECT id FROM public.submission_jobs WHERE submission_id = ANY(submission_keys));
  DELETE FROM public.submission_jobs WHERE submission_id = ANY(submission_keys);
  DELETE FROM public.submission_revisions WHERE submission_id = ANY(submission_keys);
  DELETE FROM public.submission_grades WHERE submission_id = ANY(submission_keys);
  DELETE FROM public.assignment_comments WHERE assignment_id = a.id;
  DELETE FROM public.notifications WHERE assignment_id = a.id::text;
  DELETE FROM public."submissionTable" WHERE assignment_id = a.id;
  DELETE FROM public."assignmentTable" WHERE id = a.id AND classroom_id = a.classroom_id AND teacher_id = auth.uid();
  RETURN jsonb_build_object('deleted', true, 'id', a.id, 'classroomId', a.classroom_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assignment_deletion_preview(TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_assignment_confirmed(TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assignment_deletion_preview(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_assignment_confirmed(TEXT,TEXT,TEXT,BOOLEAN) TO authenticated;
COMMIT;
