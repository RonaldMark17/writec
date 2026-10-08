-- Apply LAST, after student_resubmission.sql and submission_provenance.sql.
-- Original work and private results are preserved; existing submissions are unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.submission_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id TEXT NOT NULL,
  requested_by UUID NOT NULL,
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 5000),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL,
  replacement_file TEXT,
  replacement_text TEXT,
  replacement_title TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS submission_revision_pending ON public.submission_revisions(submission_id) WHERE completed_at IS NULL;
ALTER TABLE public.submission_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_revisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.submission_revisions TO service_role;

CREATE OR REPLACE FUNCTION public.request_submission_revision(submission_key TEXT, instructions TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public."submissionTable"%ROWTYPE; r public.submission_revisions%ROWTYPE; job_state TEXT;
BEGIN
  IF NOT public.can_access_submission(submission_key, true) THEN
    RAISE EXCEPTION 'Only the classroom teacher can request revisions.' USING ERRCODE = '42501';
  END IF;
  IF instructions IS NULL OR length(trim(instructions)) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Enter revision instructions (up to 5000 characters).';
  END IF;
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = submission_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found.'; END IF;
  PERFORM 1 FROM public."classroomTable" WHERE id = s.classroom_id AND NOT COALESCE(is_archived, false) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archived classrooms are read-only.'; END IF;
  SELECT state INTO job_state FROM public.submission_jobs WHERE submission_id = submission_key FOR UPDATE;
  IF job_state IN ('submitted','processing') THEN RAISE EXCEPTION 'Wait for processing to finish before requesting revisions.'; END IF;
  SELECT * INTO r FROM public.submission_revisions WHERE submission_id = submission_key AND completed_at IS NULL;
  IF FOUND THEN RETURN jsonb_build_object('id', r.id); END IF;
  INSERT INTO public.submission_revisions(submission_id, requested_by, message, snapshot)
    VALUES (submission_key, auth.uid(), trim(instructions), to_jsonb(s)) RETURNING * INTO r;
  RETURN jsonb_build_object('id', r.id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_submission_revision(TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_submission_revision(TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_requested_revision(submission_key TEXT, student_key UUID, request_key UUID,
  new_title TEXT, new_file TEXT, new_text TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public."submissionTable"%ROWTYPE; r public.submission_revisions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = submission_key FOR UPDATE;
  IF NOT FOUND OR s.student_id IS DISTINCT FROM student_key THEN
    RAISE EXCEPTION 'Submission does not belong to this student.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."userTable" WHERE id = student_key AND role = 'student' AND account_status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public."classroomMembers" WHERE classroom_id = s.classroom_id AND student_id = student_key) THEN
    RAISE EXCEPTION 'Only active enrolled students can submit revisions.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public."classroomTable" WHERE id = s.classroom_id AND NOT COALESCE(is_archived, false) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archived classrooms are read-only.'; END IF;
  SELECT * INTO r FROM public.submission_revisions WHERE id = request_key AND submission_id = submission_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No matching revision request. Refresh your assignments.'; END IF;
  IF r.completed_at IS NOT NULL THEN
    IF r.replacement_file = new_file AND r.replacement_text = new_text AND r.replacement_title = new_title THEN
      RETURN jsonb_build_object('id', s.id, 'already_submitted', true);
    END IF;
    RAISE EXCEPTION 'This revision request has already been completed.';
  END IF;
  IF NULLIF(trim(new_title),'') IS NULL OR NULLIF(trim(new_text),'') IS NULL
    OR length(new_title) > 500 OR length(new_text) > 250000 OR length(new_file) > 2048
    OR new_file IS NULL OR new_file LIKE '%..%'
    OR NOT (new_file LIKE student_key::text || '/' || s.assignment_id::text || '/%'
      OR new_file LIKE '%/uploads/submissions/' || student_key::text || '/' || s.assignment_id::text || '/%') THEN
    RAISE EXCEPTION 'Review your text and upload a file belonging to this assignment.';
  END IF;
  -- An explicit teacher request reopens this submission even after its original deadline.
  UPDATE public.submission_revisions SET completed_at = now(), replacement_file = new_file,
    replacement_text = new_text, replacement_title = new_title WHERE id = request_key;
  UPDATE public."submissionTable" SET essay_title = new_title, file_url = new_file, transcribed_text = new_text,
    scan_result = NULL, plagiarism_score = NULL, grade = NULL, feedback = NULL, returned_at = NULL,
    status = 'submitted', created_at = now() WHERE id = s.id;
  INSERT INTO public.submission_jobs(submission_id, input_text) VALUES (submission_key, new_text)
    ON CONFLICT (submission_id) DO UPDATE SET id = gen_random_uuid(), state = 'submitted', attempts = 0,
      input_text = new_text, checkpoint = '{}', provider_result = NULL, provider_error = NULL,
      error = NULL, lease = NULL, lease_until = NULL, updated_at = now();
  RETURN jsonb_build_object('id', s.id, 'already_submitted', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_requested_revision(TEXT,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requested_revision(TEXT,UUID,UUID,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pending_revision()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.submission_revisions WHERE submission_id = OLD.id::text AND completed_at IS NULL) THEN
    RAISE EXCEPTION 'Wait for the student to submit the requested revision before changing this work.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_pending_revision ON public."submissionTable";
CREATE TRIGGER guard_pending_revision BEFORE UPDATE ON public."submissionTable" FOR EACH ROW EXECUTE FUNCTION public.guard_pending_revision();
REVOKE ALL ON FUNCTION public.guard_pending_revision() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submission_revision_history(submission_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'message', r.message,
    'requested_at', r.requested_at, 'completed_at', r.completed_at,
    'essay_title', r.snapshot->>'essay_title', 'file_url', r.snapshot->>'file_url',
    'transcribed_text', r.snapshot->>'transcribed_text') ORDER BY r.requested_at), '[]'::jsonb)
  FROM public.submission_revisions r WHERE r.submission_id = submission_key AND public.can_access_submission(submission_key);
$$;
REVOKE ALL ON FUNCTION public.submission_revision_history(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submission_revision_history(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_submission_results()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'revision_request', (SELECT jsonb_build_object('id', r.id, 'message', r.message, 'requested_at', r.requested_at) FROM public.submission_revisions r WHERE r.submission_id = s.id::text AND r.completed_at IS NULL),
    'revision_history', public.submission_revision_history(s.id::text),
    'id', s.id, 'created_at', s.created_at, 'assignment_id', s.assignment_id,
    'classroom_id', s.classroom_id, 'student_id', s.student_id,
    'essay_title', s.essay_title, 'file_url', s.file_url, 'returned_at', CASE WHEN public.submission_report_verified(s.id::text) THEN s.returned_at END,
    'status', CASE WHEN NULLIF(trim(s.grade::text), '') IS NOT NULL THEN 'graded' ELSE COALESCE(s.status, 'submitted') END,
    'grade', CASE WHEN (s.returned_at IS NOT NULL AND public.submission_report_verified(s.id::text)) OR public.can_access_submission(s.id::text,true) THEN s.grade END,
    'feedback', CASE WHEN (s.returned_at IS NOT NULL AND public.submission_report_verified(s.id::text)) OR public.can_access_submission(s.id::text,true) THEN s.feedback END,
    'transcribed_text', CASE WHEN (s.returned_at IS NOT NULL AND public.submission_report_verified(s.id::text)) OR public.can_access_submission(s.id::text,true) THEN s.transcribed_text END,
    'scan_result', CASE WHEN public.can_access_submission(s.id::text,true) THEN s.scan_result END,
    'plagiarism_score', CASE WHEN public.can_access_submission(s.id::text,true) THEN s.plagiarism_score END
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public."submissionTable" s WHERE public.can_access_submission(s.id::text);
$$;
CREATE OR REPLACE FUNCTION public.can_access_essay_file(file_key TEXT, writing BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.writecheck_active() AND (
    (split_part(file_key,'/',1) = auth.uid()::text AND public.can_use_assignment(split_part(file_key,'/',2))
      AND EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND role = 'student')
      AND (NOT writing OR (NOT EXISTS (SELECT 1 FROM public."submissionTable" s WHERE s.file_url = file_key)
        AND NOT EXISTS (SELECT 1 FROM public.submission_revisions r WHERE r.snapshot->>'file_url' = file_key
          OR right(split_part(r.snapshot->>'file_url','?',1), length('/essay-submissions/' || file_key)) = '/essay-submissions/' || file_key))))
    OR (NOT writing AND EXISTS (SELECT 1 FROM public.submission_revisions r WHERE public.can_access_submission(r.submission_id) AND (r.snapshot->>'file_url' = file_key OR right(split_part(r.snapshot->>'file_url','?',1), length('/essay-submissions/' || file_key)) = '/essay-submissions/' || file_key)))
    OR (NOT writing AND EXISTS (SELECT 1 FROM public."submissionTable" s
      WHERE public.can_access_submission(s.id::text) AND (s.file_url = file_key
        OR right(split_part(s.file_url,'?',1), length('/essay-submissions/' || file_key)) = '/essay-submissions/' || file_key)))
  );
$$;

CREATE OR REPLACE FUNCTION public.submission_history_files()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('file_url', r.snapshot->>'file_url')), '[]'::jsonb)
  FROM public.submission_revisions r WHERE public.can_access_submission(r.submission_id);
$$;
REVOKE ALL ON FUNCTION public.submission_history_files() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submission_history_files() TO authenticated;
COMMIT;
