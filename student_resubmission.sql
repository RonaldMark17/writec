-- Apply after submission_provenance.sql. Repeatable; no existing work is changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.resubmit_failed_submission(
  submission_key TEXT, student_key UUID, expected_job UUID,
  new_title TEXT, new_file TEXT, new_text TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public."submissionTable"%ROWTYPE; j public.submission_jobs%ROWTYPE;
  a public."assignmentTable"%ROWTYPE; archived BOOLEAN;
BEGIN
  -- Only the authenticated backend may call this with its verified student's ID.
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = submission_key FOR UPDATE;
  IF NOT FOUND OR s.student_id IS DISTINCT FROM student_key THEN
    RAISE EXCEPTION 'Submission does not belong to this student.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."userTable" WHERE id = student_key AND role = 'student' AND account_status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public."classroomMembers" WHERE classroom_id = s.classroom_id AND student_id = student_key) THEN
    RAISE EXCEPTION 'Only active enrolled students can resubmit.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(s.grade::text),'') IS NOT NULL OR s.status = 'graded' OR s.returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Graded work cannot be resubmitted.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO a FROM public."assignmentTable" WHERE id = s.assignment_id FOR SHARE;
  SELECT is_archived INTO archived FROM public."classroomTable" WHERE id = s.classroom_id FOR SHARE;
  IF archived OR (a.accept_late_submissions = false AND a.due_date < now()) THEN
    RAISE EXCEPTION 'Submissions are closed for this assignment.';
  END IF;
  IF NULLIF(trim(new_title),'') IS NULL OR NULLIF(trim(new_text),'') IS NULL
    OR length(new_text) > 250000 OR length(new_title) > 500 OR length(new_file) > 2048
    OR new_file IS NULL OR new_file LIKE '%..%'
    OR NOT (new_file LIKE student_key::text || '/' || s.assignment_id::text || '/%'
      OR new_file LIKE '%/uploads/submissions/' || student_key::text || '/' || s.assignment_id::text || '/%') THEN
    RAISE EXCEPTION 'Review the text and upload a file belonging to this assignment.';
  END IF;
  SELECT * INTO j FROM public.submission_jobs WHERE submission_id = submission_key FOR UPDATE;
  -- A retry after a lost response must not enqueue twice or overwrite newer work.
  IF j.checkpoint->>'student_resubmission' = expected_job::text
    AND s.file_url = new_file AND s.transcribed_text = new_text AND s.essay_title = new_title THEN
    RETURN jsonb_build_object('id', s.id, 'already_submitted', true);
  END IF;
  IF j.state IS DISTINCT FROM 'failed' OR j.id IS DISTINCT FROM expected_job THEN
    RAISE EXCEPTION 'Only the current failed check can be resubmitted. Refresh your submissions.';
  END IF;
  UPDATE public."submissionTable" SET essay_title = new_title, file_url = new_file,
    transcribed_text = new_text, scan_result = NULL, plagiarism_score = NULL,
    feedback = NULL, returned_at = NULL, status = 'submitted' WHERE id = s.id;
  UPDATE public.submission_jobs SET id = gen_random_uuid(), state = 'submitted', attempts = 0,
    input_text = new_text, checkpoint = jsonb_build_object('student_resubmission', expected_job::text),
    provider_result = NULL, provider_error = NULL, error = NULL, lease = NULL,
    lease_until = NULL, updated_at = now() WHERE submission_id = submission_key;
  RETURN jsonb_build_object('id', s.id, 'already_submitted', false);
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_failed_submission(TEXT,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_failed_submission(TEXT,UUID,UUID,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.submission_processing_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_object_agg(s.id::text, jsonb_build_object(
    'state', COALESCE(j.state, CASE WHEN s.scan_result IS NOT NULL THEN 'ready' ELSE 'submitted' END),
    'job_id', j.id,
    'error', CASE WHEN public.can_access_submission(s.id::text, true) THEN j.error END
  )), '{}') FROM public."submissionTable" s
  LEFT JOIN public.submission_jobs j ON j.submission_id = s.id::text
  WHERE public.can_access_submission(s.id::text);
$$;
COMMIT;
