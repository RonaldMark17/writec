-- Apply after submission_processing.sql. Private, scan-versioned exported artifacts.
BEGIN;
CREATE TABLE IF NOT EXISTS public.submission_match_evidence (
  job_id UUID NOT NULL REFERENCES public.submission_jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  artifact TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (job_id, artifact)
);
ALTER TABLE public.submission_match_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_match_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.submission_match_evidence TO service_role;
-- Rechecks replace the job UUID: old offsets must never follow a new scan.
CREATE OR REPLACE FUNCTION public.clear_submission_match_evidence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    DELETE FROM public.submission_match_evidence WHERE job_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clear_submission_match_evidence ON public.submission_jobs;
CREATE TRIGGER clear_submission_match_evidence BEFORE UPDATE OF id ON public.submission_jobs
FOR EACH ROW EXECUTE FUNCTION public.clear_submission_match_evidence();
REVOKE ALL ON FUNCTION public.clear_submission_match_evidence() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.save_submission_match_artifact(job_key UUID, artifact_key TEXT, artifact_data JSONB)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.submission_match_evidence(job_id, artifact, data)
  VALUES(job_key, artifact_key, artifact_data)
  ON CONFLICT(job_id, artifact) DO UPDATE SET data = EXCLUDED.data;
  SELECT true;
$$;
REVOKE ALL ON FUNCTION public.save_submission_match_artifact(UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_submission_match_artifact(UUID,TEXT,JSONB) TO service_role;
COMMIT;
