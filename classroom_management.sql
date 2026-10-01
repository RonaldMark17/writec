-- Apply after supabase_schema.sql, admin_schema.sql, and submission_security.sql.
-- No tables or columns are added or removed. Run separately in Supabase SQL Editor.
BEGIN;

CREATE OR REPLACE FUNCTION public.remove_classroom_student(requested_classroom_id TEXT, requested_student_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_manage_classroom(requested_classroom_id) OR public.writecheck_admin())
    OR NOT EXISTS (SELECT 1 FROM public."classroomTable" WHERE id::text = requested_classroom_id) THEN
    RAISE EXCEPTION 'You cannot manage this classroom.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public."classroomMembers"
  WHERE classroom_id::text = requested_classroom_id AND student_id::text = requested_student_id;
  RETURN true;
END;
$$;

-- Restrictive policy also bounds legacy permissive SELECT policies.
ALTER TABLE public."assignmentTable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assignment_read_scope ON public."assignmentTable";
CREATE POLICY assignment_read_scope ON public."assignmentTable" AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (public.can_use_assignment(id::text) OR public.writecheck_admin());
DROP POLICY IF EXISTS assignment_authorized_read ON public."assignmentTable";
CREATE POLICY assignment_authorized_read ON public."assignmentTable" FOR SELECT TO authenticated
USING (public.can_use_assignment(id::text) OR public.writecheck_admin());
DROP POLICY IF EXISTS assignment_teacher_insert ON public."assignmentTable";
CREATE POLICY assignment_teacher_insert ON public."assignmentTable" FOR INSERT TO authenticated
WITH CHECK (teacher_id = auth.uid() AND public.can_manage_classroom(classroom_id::text));

-- Never move assignments between classrooms, including assignments without submissions.
CREATE OR REPLACE FUNCTION public.guard_assignment_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
    OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
    RAISE EXCEPTION 'Assignment identity and classroom cannot be changed.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_classroom_grades(requested_classroom_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.can_manage_classroom(requested_classroom_id) OR public.writecheck_admin()) THEN
    RAISE EXCEPTION 'You cannot export this classroom.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY assignment_title, student_name), '[]'::jsonb) INTO result
  FROM (
    SELECT a.title AS assignment_title, u.full_name AS student_name,
      jsonb_build_object(
        'subject', COALESCE(NULLIF(c.subject, ''), c.classroom_name),
        'assignment', a.title, 'assignmentId', a.id, 'student', u.full_name,
        'studentId', u.id, 'classroom', c.classroom_name, 'section', c.section,
        'score', to_jsonb(s)->>'grade', 'due', a.due_date, 'submitted', s.created_at,
        'returned', to_jsonb(s)->>'returned_at', 'feedback', to_jsonb(s)->>'feedback',
        'status', CASE WHEN s.id IS NULL THEN 'Not submitted'
          WHEN NULLIF(trim(to_jsonb(s)->>'grade'), '') IS NULL THEN 'Awaiting grade' ELSE 'Graded' END,
        'timing', CASE WHEN s.id IS NULL THEN '' WHEN a.due_date IS NULL THEN 'No deadline'
          WHEN s.created_at > a.due_date THEN 'Late' ELSE 'On time' END
      ) AS row_data
    FROM public."classroomTable" c
    JOIN public."assignmentTable" a ON a.classroom_id = c.id AND a.teacher_id = c.teacher_id
    -- Retain historical grades for removed students, while excluding unrelated students.
    JOIN LATERAL (
      SELECT m.student_id FROM public."classroomMembers" m WHERE m.classroom_id = c.id
      UNION
      SELECT h.student_id FROM public."submissionTable" h WHERE h.classroom_id = c.id AND h.assignment_id = a.id
    ) roster ON true
    JOIN public."userTable" u ON u.id = roster.student_id
    LEFT JOIN LATERAL (
      SELECT s0.* FROM public."submissionTable" s0
      WHERE s0.classroom_id = c.id AND s0.assignment_id = a.id AND s0.student_id = u.id
      ORDER BY s0.created_at DESC, s0.id DESC LIMIT 1
    ) s ON true
    WHERE c.id::text = requested_classroom_id
  ) records;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_classroom_student(TEXT,TEXT), public.export_classroom_grades(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_classroom_student(TEXT,TEXT), public.export_classroom_grades(TEXT) TO authenticated;
COMMIT;
