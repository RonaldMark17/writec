-- Run after submission_release.sql. Jobs and results live in the same database.
BEGIN;
CREATE TABLE IF NOT EXISTS public.submission_jobs (
  submission_id TEXT PRIMARY KEY,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  state TEXT NOT NULL DEFAULT 'submitted' CHECK (state IN ('submitted','processing','ready','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease UUID,
  lease_until TIMESTAMPTZ,
  input_text TEXT,
  checkpoint JSONB NOT NULL DEFAULT '{}',
  provider_result JSONB,
  provider_error TEXT,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.submission_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.submission_jobs TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS submission_jobs_id_idx ON public.submission_jobs(id);
CREATE INDEX IF NOT EXISTS submission_jobs_state_idx ON public.submission_jobs(state, updated_at);

CREATE OR REPLACE FUNCTION public.guard_processing_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_state TEXT;
BEGIN
  SELECT state INTO job_state FROM public.submission_jobs WHERE submission_id = OLD.id::text FOR UPDATE;
  IF NEW.returned_at IS NOT NULL AND job_state IN ('submitted','processing','failed') THEN
    RAISE EXCEPTION 'Finish processing and review the results before returning work.';
  END IF;
  IF auth.role() IN ('authenticated','anon') AND job_state IN ('submitted','processing') AND
    (NEW.transcribed_text IS DISTINCT FROM OLD.transcribed_text OR NEW.scan_result IS DISTINCT FROM OLD.scan_result) THEN
    RAISE EXCEPTION 'Wait for processing to finish before editing results.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_processing_review ON public."submissionTable";
CREATE TRIGGER guard_processing_review BEFORE UPDATE ON public."submissionTable"
FOR EACH ROW EXECUTE FUNCTION public.guard_processing_review();
REVOKE ALL ON FUNCTION public.guard_processing_review() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.submission_jobs(submission_id) VALUES (NEW.id::text) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enqueue_submission ON public."submissionTable";
CREATE TRIGGER enqueue_submission AFTER INSERT ON public."submissionTable"
FOR EACH ROW EXECUTE FUNCTION public.enqueue_submission();
REVOKE ALL ON FUNCTION public.enqueue_submission() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_assignment(submission_key UUID, assignment_key TEXT, title TEXT, upload_path TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_id TEXT;
BEGIN
  IF NOT public.can_use_assignment(assignment_key) OR (public.current_account()->>'role') <> 'student' THEN
    RAISE EXCEPTION 'Only enrolled students can submit work.' USING ERRCODE = '42501';
  END IF;
  -- Serialize duplicate clicks/retries, including retries after a lost HTTP response.
  PERFORM 1 FROM public."assignmentTable" WHERE id::text = assignment_key FOR UPDATE;
  SELECT id::text INTO existing_id FROM public."submissionTable"
    WHERE assignment_id::text = assignment_key AND student_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', existing_id, 'already_submitted', true);
  END IF;
  INSERT INTO public."submissionTable"(id, assignment_id, classroom_id, student_id, essay_title, file_url, status)
    SELECT submission_key, a.id, a.classroom_id, auth.uid(), submit_assignment.title, upload_path, 'submitted'
    FROM public."assignmentTable" a WHERE a.id::text = assignment_key;
  RETURN jsonb_build_object('id', submission_key, 'already_submitted', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_assignment(UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submission_processing_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_object_agg(s.id::text, jsonb_build_object(
    'state', COALESCE(j.state, CASE WHEN s.scan_result IS NOT NULL THEN 'ready' ELSE 'submitted' END),
    'error', CASE WHEN public.can_access_submission(s.id::text, true) THEN j.error END
  )), '{}') FROM public."submissionTable" s
  LEFT JOIN public.submission_jobs j ON j.submission_id = s.id::text
  WHERE public.can_access_submission(s.id::text);
$$;

CREATE OR REPLACE FUNCTION public.retry_submission_processing(submission_key TEXT, corrected_text TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.submission_jobs%ROWTYPE;
BEGIN
  IF NOT public.can_access_submission(submission_key, true) THEN
    RAISE EXCEPTION 'Only the classroom teacher can request a check.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public."submissionTable" WHERE id::text = submission_key FOR UPDATE;
  SELECT * INTO j FROM public.submission_jobs WHERE submission_id = submission_key FOR UPDATE;
  IF j.state IN ('submitted','processing') THEN
    RETURN jsonb_build_object('state', j.state);
  END IF;
  IF corrected_text IS NOT NULL AND length(trim(corrected_text)) < 1 THEN
    RAISE EXCEPTION 'Enter transcription text before rechecking.';
  END IF;
  IF j.state = 'failed' AND j.provider_error IS NULL AND corrected_text IS NOT DISTINCT FROM j.input_text THEN
    UPDATE public.submission_jobs SET state = 'submitted', error = NULL, lease = NULL,
      lease_until = NULL, updated_at = now() WHERE submission_id = submission_key;
  ELSE
    INSERT INTO public.submission_jobs(submission_id, input_text) VALUES (submission_key, corrected_text)
    ON CONFLICT (submission_id) DO UPDATE SET id = gen_random_uuid(), state = 'submitted', attempts = 0,
      input_text = corrected_text, checkpoint = '{}', provider_result = NULL, provider_error = NULL,
      error = NULL, lease = NULL, lease_until = NULL, updated_at = now();
  END IF;
  UPDATE public."submissionTable" SET returned_at = NULL WHERE id::text = submission_key;
  RETURN jsonb_build_object('state','submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_submission_job()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.submission_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM public.submission_jobs
    WHERE state = 'submitted' OR (state = 'processing' AND lease_until < now())
    ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.submission_jobs SET state = 'processing', attempts = attempts + 1,
    lease = gen_random_uuid(), lease_until = now() + interval '2 minutes', updated_at = now()
    WHERE submission_id = j.submission_id RETURNING * INTO j;
  RETURN to_jsonb(j);
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_submission_job(job_key TEXT, lease_key UUID, saved_checkpoint JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.submission_jobs SET checkpoint = COALESCE(saved_checkpoint, checkpoint),
    lease_until = now() + interval '2 minutes', updated_at = now()
    WHERE submission_id = job_key AND lease = lease_key AND state = 'processing' AND lease_until > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_submission_job(job_key TEXT, lease_key UUID, result_text TEXT, result_scan JSONB, failure TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public."submissionTable" WHERE id::text = job_key FOR UPDATE;
  PERFORM 1 FROM public.submission_jobs WHERE submission_id = job_key AND lease = lease_key
    AND state = 'processing' AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF failure IS NULL THEN
    IF NULLIF(trim(result_text),'') IS NULL OR result_scan IS NULL THEN
      RAISE EXCEPTION 'Processing did not produce a result.';
    END IF;
    UPDATE public."submissionTable" SET transcribed_text = result_text, scan_result = result_scan,
      plagiarism_score = (result_scan->>'score')::numeric, returned_at = NULL WHERE id::text = job_key;
  END IF;
  UPDATE public.submission_jobs SET state = CASE WHEN failure IS NULL THEN 'ready' ELSE 'failed' END,
    error = failure, lease = NULL, lease_until = NULL, updated_at = now() WHERE submission_id = job_key;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submission_processing_status(), public.retry_submission_processing(TEXT,TEXT),
  public.claim_submission_job(), public.checkpoint_submission_job(TEXT,UUID,JSONB),
  public.finish_submission_job(TEXT,UUID,TEXT,JSONB,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submission_processing_status(), public.retry_submission_processing(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_submission_job(), public.checkpoint_submission_job(TEXT,UUID,JSONB),
  public.finish_submission_job(TEXT,UUID,TEXT,JSONB,TEXT) TO service_role;
COMMIT;
