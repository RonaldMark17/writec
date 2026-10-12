-- Apply after submission_revisions.sql and submission_provenance.sql.
-- No columns or original files are changed. Saves do not enqueue scans.
BEGIN;
CREATE OR REPLACE FUNCTION public.edit_submission_transcription(submission_key TEXT, corrected_text TEXT, expected_text TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public."submissionTable"%ROWTYPE; job_state TEXT;
BEGIN
  IF NOT public.can_access_submission(submission_key, true) THEN
    RAISE EXCEPTION 'Only the classroom teacher can edit student work.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public."submissionTable" WHERE id::text = submission_key FOR UPDATE;
  SELECT state INTO job_state FROM public.submission_jobs WHERE submission_id = submission_key FOR UPDATE;
  IF job_state IN ('submitted','processing') THEN
    RAISE EXCEPTION 'Wait for processing to finish before editing student work.';
  END IF;
  IF corrected_text IS NULL OR length(trim(corrected_text)) = 0 THEN
    RAISE EXCEPTION 'Enter extracted student work before saving.';
  END IF;
  IF COALESCE(s.transcribed_text,'') IS DISTINCT FROM expected_text THEN
    RAISE EXCEPTION 'The saved transcription changed. Refresh before editing again.' USING ERRCODE = '40001';
  END IF;
  IF s.transcribed_text IS DISTINCT FROM corrected_text THEN
    UPDATE public."submissionTable" SET transcribed_text = corrected_text,
      scan_result = CASE WHEN scan_result IS NULL THEN NULL ELSE scan_result || jsonb_build_object('stale', true) END,
      plagiarism_score = NULL
      WHERE id::text = submission_key RETURNING * INTO s;
  END IF;
  RETURN jsonb_build_object('id',s.id,'transcribed_text',s.transcribed_text,'scan_result',s.scan_result,'returned_at',s.returned_at);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_submission_transcription(TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_submission_transcription(TEXT,TEXT,TEXT) TO authenticated;
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
  IF COALESCE((s.scan_result->>'stale')::boolean,false) OR
    (s.scan_result ? 'transcribedText' AND s.scan_result->>'transcribedText' IS DISTINCT FROM s.transcribed_text) THEN RETURN false; END IF;
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
COMMIT;
