-- Apply AFTER supabase_schema.sql, as the database owner in Supabase SQL Editor.
-- Uses the existing five academic tables. All changes are transactional.
BEGIN;
-- Extend conventional, single-column text role checks without touching other
-- constraints. Projects with custom role enums must add 'admin' to that enum first.
DO $$ DECLARE item RECORD; role_column SMALLINT; BEGIN
  SELECT attnum INTO role_column FROM pg_attribute
  WHERE attrelid = 'public."userTable"'::regclass AND attname = 'role';
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public."userTable"'::regclass AND contype = 'c'
      AND conkey = ARRAY[role_column]::smallint[]
      AND pg_get_constraintdef(oid) LIKE '%student%'
      AND pg_get_constraintdef(oid) LIKE '%teacher%'
  LOOP
    EXECUTE format('ALTER TABLE public."userTable" DROP CONSTRAINT %I', item.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public."userTable"'::regclass AND conname = 'writecheck_workspace_role') THEN
    ALTER TABLE public."userTable" ADD CONSTRAINT writecheck_workspace_role CHECK (role::text IN ('student','teacher','admin'));
  END IF;
END $$;
ALTER TABLE public."userTable" ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'inactive'));
-- Do not invent registration dates for existing users.
ALTER TABLE public."userTable" ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;
UPDATE public."userTable" p SET registered_at = a.created_at FROM auth.users a
WHERE p.id = a.id AND p.registered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON public.activity_logs(created_at DESC);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.writecheck_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND account_status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.writecheck_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND role = 'admin' AND account_status = 'active');
$$;

-- An authenticated caller can inspect ONLY their own authoritative account state.
CREATE OR REPLACE FUNCTION public.current_account()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', id, 'full_name', full_name, 'email', email,
    'role', role, 'account_status', account_status, 'registered_at', registered_at)
  FROM public."userTable" WHERE id = auth.uid();
$$;

-- Preserve actual Auth registration timestamps for new profiles.
CREATE OR REPLACE FUNCTION public.set_profile_registration_date()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.registered_at := (SELECT created_at FROM auth.users WHERE id = NEW.id);
  RETURN NEW;
END;
$$;
-- Block direct profile privilege changes without trusting user metadata.
CREATE OR REPLACE FUNCTION public.guard_profile_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF auth.uid() IS NULL OR NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Cannot modify another account.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.role NOT IN ('student', 'teacher') OR NEW.account_status <> 'active' THEN
        RAISE EXCEPTION 'Invalid account role or status.' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.account_status IS DISTINCT FROM OLD.account_status
      OR NEW.registered_at IS DISTINCT FROM OLD.registered_at OR NOT public.writecheck_active() THEN
      RAISE EXCEPTION 'Cannot change protected account fields.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_fields ON public."userTable";
CREATE TRIGGER guard_profile_fields BEFORE INSERT OR UPDATE ON public."userTable"
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_fields();
DROP TRIGGER IF EXISTS set_profile_registration_date ON public."userTable";
CREATE TRIGGER set_profile_registration_date BEFORE INSERT ON public."userTable"
FOR EACH ROW EXECUTE FUNCTION public.set_profile_registration_date();

-- Keep existing permissive policies; AND an active-account requirement onto them.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['classroomTable','classroomMembers','assignmentTable','submissionTable','plagiarism_scans','submission_grades'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS active_account_required ON public.%I', t);
    EXECUTE format('CREATE POLICY active_account_required ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.writecheck_active() AND NOT public.writecheck_admin()) WITH CHECK (public.writecheck_active() AND NOT public.writecheck_admin())', t);
  END LOOP;
END $$;
ALTER TABLE public."userTable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_profile_read ON public."userTable";
CREATE POLICY own_profile_read ON public."userTable" FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS profile_read_active ON public."userTable";
CREATE POLICY profile_read_active ON public."userTable" AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (id = auth.uid() OR public.writecheck_active());
DROP POLICY IF EXISTS no_profile_delete ON public."userTable";
CREATE POLICY no_profile_delete ON public."userTable" AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Private student files also require an active account, in addition to bucket policies.
DROP POLICY IF EXISTS writecheck_active_storage ON storage.objects;
CREATE POLICY writecheck_active_storage ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'essay-submissions' OR public.writecheck_active())
WITH CHECK (bucket_id <> 'essay-submissions' OR public.writecheck_active());
-- Public bucket reads bypass RLS. Existing clients already use signed URLs.
UPDATE storage.buckets SET public = false WHERE id = 'essay-submissions';

-- These existing definer functions must explicitly enforce inactive-account checks.
CREATE OR REPLACE FUNCTION public.update_my_profile(new_full_name TEXT)
RETURNS TABLE (full_name TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.writecheck_active() THEN RAISE EXCEPTION 'Account is inactive or not signed in.' USING ERRCODE = '42501'; END IF;
  IF new_full_name IS NULL OR length(trim(new_full_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Enter a name between 1 and 120 characters.'; END IF;
  RETURN QUERY UPDATE public."userTable" u SET full_name = trim(new_full_name) WHERE u.id = auth.uid() RETURNING u.full_name::text;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_classroom_roster(requested_classroom_id TEXT)
RETURNS TABLE (student_id TEXT, student_name TEXT) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.writecheck_active() OR NOT EXISTS (
    SELECT 1 FROM public."classroomTable" c WHERE c.id::text = requested_classroom_id
    AND (c.teacher_id = auth.uid() OR EXISTS (SELECT 1 FROM public."classroomMembers" m WHERE m.classroom_id = c.id AND m.student_id = auth.uid()))
  ) THEN RAISE EXCEPTION 'You do not have access to this classroom.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT DISTINCT m.student_id::text, COALESCE(NULLIF(trim(u.full_name), ''), 'Student')::text AS student_name
  FROM public."classroomMembers" m LEFT JOIN public."userTable" u ON u.id = m.student_id
  WHERE m.classroom_id::text = requested_classroom_id ORDER BY student_name, m.student_id::text;
END;
$$;

-- Only genuine new events are logged; historical activity is never fabricated.
CREATE OR REPLACE FUNCTION public.log_writecheck_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID; event_name TEXT; target_label TEXT; row_data JSONB := to_jsonb(NEW);
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'userTable' THEN actor := NEW.id; event_name := 'User registered'; target_label := NEW.full_name;
    WHEN 'classroomTable' THEN actor := NEW.teacher_id; event_name := 'Created class'; target_label := NEW.classroom_name;
    WHEN 'classroomMembers' THEN actor := NEW.student_id; event_name := 'Joined class';
      SELECT classroom_name INTO target_label FROM public."classroomTable" WHERE id = NEW.classroom_id;
    WHEN 'assignmentTable' THEN actor := NEW.teacher_id; event_name := 'Created activity'; target_label := NEW.title;
    WHEN 'submissionTable' THEN actor := NEW.student_id; event_name := 'Submitted essay'; target_label := NEW.essay_title;
  END CASE;
  INSERT INTO public.activity_logs(user_id, actor_name, actor_role, action, target_type, target_id, target_name)
  SELECT actor, u.full_name, u.role, event_name, TG_TABLE_NAME, row_data->>'id', target_label
  FROM (SELECT 1) seed LEFT JOIN public."userTable" u ON u.id = actor;
  RETURN NEW;
END;
$$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['userTable','classroomTable','classroomMembers','assignmentTable','submissionTable'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS writecheck_activity ON public.%I', t);
    EXECUTE format('CREATE TRIGGER writecheck_activity AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_writecheck_event()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(target_user_id TEXT, new_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public."userTable"%ROWTYPE;
BEGIN
  IF NOT public.writecheck_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF new_status NOT IN ('active','inactive') OR new_status IS NULL THEN RAISE EXCEPTION 'Invalid status.'; END IF;
  SELECT * INTO target FROM public."userTable" WHERE id::text = target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found.' USING ERRCODE = 'P0002'; END IF;
  IF target.role NOT IN ('student','teacher') OR target.id = auth.uid() THEN RAISE EXCEPTION 'Only student and teacher accounts can be managed.' USING ERRCODE = '42501'; END IF;
  IF target.account_status IS DISTINCT FROM new_status THEN
    UPDATE public."userTable" SET account_status = new_status WHERE id = target.id;
    INSERT INTO public.activity_logs(user_id, actor_name, actor_role, action, target_type, target_id, target_name)
    SELECT id, full_name, role, CASE WHEN new_status = 'inactive' THEN 'Disabled account' ELSE 'Reactivated account' END,
      'userTable', target.id::text, target.full_name FROM public."userTable" WHERE id = auth.uid();
  END IF;
  RETURN jsonb_build_object('id', target.id, 'account_status', new_status);
END;
$$;

-- Whitelisted projections only: no passwords, tokens, essay bodies or auth metadata.
CREATE OR REPLACE FUNCTION public.admin_read(section TEXT, filters JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result JSONB; needle TEXT := lower(COALESCE(filters->>'search',''));
  page_num INTEGER := greatest(1, least(100000, COALESCE((filters->>'page')::integer,1)));
  target_id TEXT := filters->>'id';
BEGIN
  IF NOT public.writecheck_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF section = 'dashboard' THEN
    SELECT jsonb_build_object(
      'students', (SELECT count(*) FROM public."userTable" WHERE role = 'student'),
      'teachers', (SELECT count(*) FROM public."userTable" WHERE role = 'teacher'),
      'classes', (SELECT count(*) FROM public."classroomTable"),
      'submissions', (SELECT count(*) FROM public."submissionTable"),
      'active', (SELECT count(*) FROM public."userTable" WHERE account_status = 'active'),
      'inactive', (SELECT count(*) FROM public."userTable" WHERE account_status = 'inactive'),
      'recent_users', COALESCE((SELECT jsonb_agg(x) FROM (SELECT id, full_name, email, role, registered_at, account_status FROM public."userTable" WHERE registered_at IS NOT NULL ORDER BY registered_at DESC LIMIT 5) x),'[]'::jsonb),
      'recent_activity', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM public.activity_logs ORDER BY created_at DESC, id DESC LIMIT 5) x),'[]'::jsonb)
    ) INTO result;
  ELSIF section = 'users' THEN
    WITH matching AS (
      SELECT id, full_name, email, role, registered_at, account_status FROM public."userTable"
      WHERE role IN ('student','teacher') AND (COALESCE(filters->>'role','all') = 'all' OR role = filters->>'role')
      AND (COALESCE(filters->>'status','all') = 'all' OR account_status = filters->>'status')
      AND strpos(lower(COALESCE(full_name,'') || ' ' || COALESCE(email,'')), needle) > 0
    ), paged AS (SELECT * FROM matching ORDER BY registered_at DESC NULLS LAST, id LIMIT 25 OFFSET (page_num-1)*25)
    SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb), 'total', (SELECT count(*) FROM matching)) INTO result;
  ELSIF section = 'user' THEN
    SELECT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email, 'role', u.role,
      'registered_at', u.registered_at, 'account_status', u.account_status,
      'student_id', to_jsonb(u)->>'student_id', 'faculty_id', to_jsonb(u)->>'faculty_id',
      'joined_classes', (SELECT count(*) FROM public."classroomMembers" WHERE student_id = u.id),
      'submissions', (SELECT count(*) FROM public."submissionTable" WHERE student_id = u.id),
      'created_classes', (SELECT count(*) FROM public."classroomTable" WHERE teacher_id = u.id),
      'activities', (SELECT count(*) FROM public."assignmentTable" WHERE teacher_id = u.id)) INTO result
    FROM public."userTable" u WHERE u.id::text = target_id;
  ELSIF section = 'classes' THEN
    WITH matching AS (
      SELECT c.id, c.classroom_name, c.classroom_code, c.section, c.subject, c.created_at, u.full_name AS teacher_name,
        to_jsonb(c)->>'status' AS status,
        (SELECT count(*) FROM public."classroomMembers" WHERE classroom_id = c.id) AS students,
        (SELECT count(*) FROM public."assignmentTable" WHERE classroom_id = c.id) AS activities
      FROM public."classroomTable" c LEFT JOIN public."userTable" u ON u.id = c.teacher_id
      WHERE strpos(lower(COALESCE(c.classroom_name,'') || ' ' || COALESCE(u.full_name,'')), needle) > 0
    ), paged AS (SELECT * FROM matching ORDER BY created_at DESC, id LIMIT 25 OFFSET (page_num-1)*25)
    SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb), 'total', (SELECT count(*) FROM matching)) INTO result;
  ELSIF section = 'class' THEN
    SELECT jsonb_build_object('id', c.id, 'classroom_name', c.classroom_name, 'classroom_code', c.classroom_code,
      'teacher_name', u.full_name, 'created_at', c.created_at, 'section', c.section, 'subject', c.subject,
      'activities', (SELECT count(*) FROM public."assignmentTable" WHERE classroom_id = c.id),
      'submissions', (SELECT count(*) FROM public."submissionTable" WHERE classroom_id = c.id),
      'students', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email))
        FROM public."classroomMembers" m JOIN public."userTable" p ON p.id = m.student_id WHERE m.classroom_id = c.id),'[]'::jsonb)) INTO result
    FROM public."classroomTable" c LEFT JOIN public."userTable" u ON u.id = c.teacher_id WHERE c.id::text = target_id;
  ELSIF section = 'logs' THEN
    WITH matching AS (
      SELECT * FROM public.activity_logs WHERE (COALESCE(filters->>'role','all') = 'all' OR actor_role = filters->>'role')
      AND strpos(lower(COALESCE(actor_name,'') || ' ' || action || ' ' || COALESCE(target_name,'')), needle) > 0
      AND (NULLIF(filters->>'date','') IS NULL OR (created_at AT TIME ZONE 'UTC')::date = (filters->>'date')::date)
    ), paged AS (SELECT * FROM matching ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET (page_num-1)*25)
    SELECT jsonb_build_object('items', COALESCE((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb), 'total', (SELECT count(*) FROM matching)) INTO result;
  ELSE RAISE EXCEPTION 'Unknown section.';
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'Record not found.' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.current_account(), public.writecheck_active(), public.writecheck_admin(),
  public.admin_read(TEXT,JSONB), public.admin_set_account_status(TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_account(), public.writecheck_active(), public.writecheck_admin(),
  public.admin_read(TEXT,JSONB), public.admin_set_account_status(TEXT,TEXT) TO authenticated;
-- anon needs the boolean helper to evaluate restrictive policies, but no profile data.
GRANT EXECUTE ON FUNCTION public.writecheck_active(), public.writecheck_admin() TO anon;
REVOKE ALL ON FUNCTION public.log_writecheck_event(), public.set_profile_registration_date(), public.guard_profile_fields() FROM PUBLIC, anon, authenticated;
COMMIT;
