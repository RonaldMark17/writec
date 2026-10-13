-- Existing classroom/assignment forms write through Supabase directly.
-- Enforce required values even when browser validation is bypassed.
BEGIN;
CREATE OR REPLACE FUNCTION public.validate_classroom_required_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.classroom_name IS NULL OR NEW.classroom_name ~ '^[[:space:]]*$' THEN
    RAISE EXCEPTION 'Classroom name is required.' USING ERRCODE = '23514',
      DETAIL = '{"field":"classroom_name","message":"Classroom name is required."}';
  END IF;
  -- A name-only edit must also work for legacy classrooms without a section.
  IF (TG_OP = 'INSERT' OR NEW.section IS DISTINCT FROM OLD.section)
     AND (NEW.section IS NULL OR NEW.section ~ '^[[:space:]]*$') THEN
    RAISE EXCEPTION 'Section is required.' USING ERRCODE = '23514',
      DETAIL = '{"field":"section","message":"Section is required."}';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_classroom_required_fields ON public."classroomTable";
CREATE TRIGGER validate_classroom_required_fields BEFORE INSERT OR UPDATE OF classroom_name, section
ON public."classroomTable" FOR EACH ROW EXECUTE FUNCTION public.validate_classroom_required_fields();

CREATE OR REPLACE FUNCTION public.validate_assignment_required_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.title IS NULL OR NEW.title ~ '^[[:space:]]*$' THEN
    RAISE EXCEPTION 'Assignment title is required.' USING ERRCODE = '23514',
      DETAIL = '{"field":"title","message":"Assignment title is required."}';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_assignment_required_fields ON public."assignmentTable";
CREATE TRIGGER validate_assignment_required_fields BEFORE INSERT OR UPDATE OF title
ON public."assignmentTable" FOR EACH ROW EXECUTE FUNCTION public.validate_assignment_required_fields();
REVOKE ALL ON FUNCTION public.validate_classroom_required_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_assignment_required_fields() FROM PUBLIC;
COMMIT;
