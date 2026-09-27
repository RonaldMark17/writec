-- Apply AFTER submission_processing.sql (and after rerunning older migrations).
-- Repeatable. Does not modify stored reports or submit new provider scans.
BEGIN;
CREATE OR REPLACE FUNCTION public.submission_report_verified(submission_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.submission_jobs%ROWTYPE; s public."submissionTable"%ROWTYPE;
  mode TEXT; score NUMERIC;
BEGIN
  IF auth.role() IN ('authenticated','anon') AND NOT public.can_access_submission(submission_key) THEN
    RETURN false;
  END IF;
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = submission_key;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO j FROM public.submission_jobs WHERE submission_id = submission_key;
  -- Preserve historical grade-only records. A report without a durable job is unverified.
  IF NOT FOUND THEN RETURN s.scan_result IS NULL; END IF;
  IF j.state <> 'ready' THEN RETURN false; END IF;
  mode := COALESCE(j.checkpoint->>'mode', 'copyleaks');
  IF mode = 'classroom' THEN
    RETURN COALESCE(s.scan_result->>'mode' = 'classroom', false);
  END IF;
  IF mode <> 'copyleaks' OR j.provider_error IS NOT NULL
    OR j.provider_result IS NULL THEN RETURN false; END IF;
  IF COALESCE(j.provider_result->>'status', '0') <> '0'
    OR (j.provider_result#>>'{scannedDocument,scanId}') IS DISTINCT FROM ('j' || replace(j.id::text,'-',''))
    OR (s.scan_result->>'scanId') IS DISTINCT FROM ('j' || replace(j.id::text,'-',''))
    OR (s.scan_result->>'provider') IS DISTINCT FROM 'copyleaks'
    OR (s.scan_result->>'mode') IS DISTINCT FROM 'copyleaks' THEN RETURN false; END IF;
  score := (j.provider_result#>>'{results,score,aggregatedScore}')::numeric;
  RETURN COALESCE(score >= 0 AND score <= 100
    AND score = (s.scan_result->>'score')::numeric AND score = s.plagiarism_score, false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.submission_report_verified(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submission_report_verified(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_processing_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_state TEXT;
BEGIN
  SELECT state INTO job_state FROM public.submission_jobs WHERE submission_id = OLD.id::text FOR UPDATE;
  IF NEW.returned_at IS NOT NULL AND NOT public.submission_report_verified(OLD.id::text) THEN
    RAISE EXCEPTION 'Finish processing and verify the provider report before returning work.';
  END IF;
  IF auth.role() IN ('authenticated','anon') AND job_state IN ('submitted','processing') AND
    (NEW.transcribed_text IS DISTINCT FROM OLD.transcribed_text OR NEW.scan_result IS DISTINCT FROM OLD.scan_result) THEN
    RAISE EXCEPTION 'Wait for processing to finish before editing results.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_processing_review() FROM PUBLIC, anon, authenticated;

-- Already returned legacy reports are also hidden at the direct table boundary.
DROP POLICY IF EXISTS submission_results_release ON public."submissionTable";
CREATE POLICY submission_results_release ON public."submissionTable" AS RESTRICTIVE
FOR SELECT TO authenticated USING (
  public.can_access_submission(id::text, true)
  OR (returned_at IS NOT NULL AND public.can_access_submission(id::text)
      AND public.submission_report_verified(id::text))
);

CREATE OR REPLACE FUNCTION public.list_submission_results()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
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


COMMIT;
