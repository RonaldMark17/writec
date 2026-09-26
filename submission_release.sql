-- Run AFTER submission_security.sql as database owner in Supabase SQL Editor.
BEGIN;
ALTER TABLE public."submissionTable" ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.guard_submission_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.returned_at := NULL;
  ELSIF NEW.grade IS DISTINCT FROM OLD.grade OR NEW.feedback IS DISTINCT FROM OLD.feedback
    OR NEW.transcribed_text IS DISTINCT FROM OLD.transcribed_text
    OR NEW.scan_result IS DISTINCT FROM OLD.scan_result OR NEW.plagiarism_score IS DISTINCT FROM OLD.plagiarism_score THEN
    NEW.returned_at := NULL;
  END IF;
  IF NEW.returned_at IS NOT NULL AND NULLIF(trim(NEW.grade::text),'') IS NULL THEN
    RAISE EXCEPTION 'Save a grade before returning work.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_submission_release ON public."submissionTable";
CREATE TRIGGER guard_submission_release BEFORE INSERT OR UPDATE ON public."submissionTable"
FOR EACH ROW EXECUTE FUNCTION public.guard_submission_release();
REVOKE ALL ON FUNCTION public.guard_submission_release() FROM PUBLIC, anon, authenticated;

-- Raw rows contain private columns, so students may read them only after return.
DROP POLICY IF EXISTS submission_results_release ON public."submissionTable";
CREATE POLICY submission_results_release ON public."submissionTable" AS RESTRICTIVE
FOR SELECT TO anon, authenticated USING (
  public.can_access_submission(id::text, true)
  OR (returned_at IS NOT NULL AND public.can_access_submission(id::text))
);
-- The unused legacy mirror must not expose unpublished results either.
DROP POLICY IF EXISTS legacy_grade_teacher_only ON public.submission_grades;
CREATE POLICY legacy_grade_teacher_only ON public.submission_grades AS RESTRICTIVE
FOR SELECT TO anon, authenticated USING (public.can_access_submission(submission_id, true));

-- Students can see grading progress before return; result contents stay private.
CREATE OR REPLACE FUNCTION public.list_submission_results()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'created_at', s.created_at, 'assignment_id', s.assignment_id,
    'classroom_id', s.classroom_id, 'student_id', s.student_id,
    'essay_title', s.essay_title, 'file_url', s.file_url, 'returned_at', s.returned_at,
    'status', CASE WHEN NULLIF(trim(s.grade::text), '') IS NOT NULL THEN 'graded' ELSE COALESCE(s.status, 'submitted') END,
    'grade', CASE WHEN s.returned_at IS NOT NULL OR public.can_access_submission(s.id::text,true) THEN s.grade END,
    'feedback', CASE WHEN s.returned_at IS NOT NULL OR public.can_access_submission(s.id::text,true) THEN s.feedback END,
    'transcribed_text', CASE WHEN s.returned_at IS NOT NULL OR public.can_access_submission(s.id::text,true) THEN s.transcribed_text END,
    'scan_result', CASE WHEN public.can_access_submission(s.id::text,true) THEN s.scan_result END,
    'plagiarism_score', CASE WHEN public.can_access_submission(s.id::text,true) THEN s.plagiarism_score END
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public."submissionTable" s WHERE public.can_access_submission(s.id::text);
$$;

CREATE OR REPLACE FUNCTION public.return_submission(submission_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public."submissionTable"%ROWTYPE;
BEGIN
  IF NOT public.can_access_submission(submission_key, true) THEN
    RAISE EXCEPTION 'Only the classroom teacher can return work.' USING ERRCODE = '42501';
  END IF;
  UPDATE public."submissionTable" SET returned_at = COALESCE(returned_at, now())
    WHERE id::text = submission_key RETURNING * INTO result;
  RETURN jsonb_build_object('id', result.id, 'returned_at', result.returned_at);
END;
$$;
REVOKE ALL ON FUNCTION public.list_submission_results(), public.return_submission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_submission_results(), public.return_submission(TEXT) TO authenticated;
COMMIT;
