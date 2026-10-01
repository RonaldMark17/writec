-- Apply after admin_schema.sql and existing security migrations. Existing accounts keep their status.
BEGIN;
DO $$ DECLARE constraint_row RECORD; status_attribute SMALLINT; BEGIN
  SELECT attnum INTO status_attribute FROM pg_attribute WHERE attrelid = 'public."userTable"'::regclass AND attname = 'account_status';
  FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid = 'public."userTable"'::regclass
    AND contype = 'c' AND conkey = ARRAY[status_attribute]::smallint[] LOOP
    EXECUTE format('ALTER TABLE public."userTable" DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;
ALTER TABLE public."userTable" ADD CONSTRAINT writecheck_account_status CHECK (account_status IN ('pending','active','inactive','rejected'));
ALTER TABLE public."userTable" ALTER COLUMN account_status SET DEFAULT 'pending';

-- Runs inside Supabase Auth even if the browser bypasses the registration form.
CREATE OR REPLACE FUNCTION public.enforce_registration_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS NULL OR lower(NEW.email) !~ '^[^[:space:]@]+@(edu[.]com[.]ph|([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+edu[.]ph)$' THEN
    RAISE EXCEPTION 'Registration is only available for approved institutional email addresses ending in @edu.com.ph or .edu.ph.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS writecheck_registration_domain ON auth.users;
CREATE TRIGGER writecheck_registration_domain BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_domain();

CREATE OR REPLACE FUNCTION public.guard_profile_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE registered_email TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role IN ('student','teacher') THEN
    SELECT email INTO registered_email FROM auth.users WHERE id = NEW.id;
    IF registered_email IS NULL OR lower(registered_email) !~ '^[^[:space:]@]+@(edu[.]com[.]ph|([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+edu[.]ph)$' THEN
      RAISE EXCEPTION 'Registration requires an @edu.com.ph address or a domain ending in .edu.ph.' USING ERRCODE = '23514';
    END IF;
    NEW.email := registered_email;
    NEW.account_status := 'pending';
  END IF;
  IF current_user IN ('anon','authenticated') THEN
    IF auth.uid() IS NULL OR NEW.id <> auth.uid() THEN RAISE EXCEPTION 'Cannot modify another account.' USING ERRCODE = '42501'; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.role NOT IN ('student','teacher') THEN RAISE EXCEPTION 'Invalid account role.' USING ERRCODE = '42501'; END IF;
    ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.account_status IS DISTINCT FROM OLD.account_status OR NEW.registered_at IS DISTINCT FROM OLD.registered_at
      OR NOT public.writecheck_active() THEN
      RAISE EXCEPTION 'Cannot change protected account fields.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_pending_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public."userTable"(id, full_name, email, role, account_status, registered_at)
    VALUES (NEW.id, COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email), NEW.email,
      CASE WHEN NEW.raw_user_meta_data->>'role' = 'teacher' THEN 'teacher' ELSE 'student' END, 'pending', NEW.created_at)
    ON CONFLICT (id) DO UPDATE SET account_status = 'pending', role = EXCLUDED.role, email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zzzz_writecheck_pending_account ON auth.users;
CREATE TRIGGER zzzz_writecheck_pending_account AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.provision_pending_account();

CREATE OR REPLACE FUNCTION public.admin_set_account_status(target_user_id TEXT, new_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public."userTable"%ROWTYPE;
BEGIN
  IF NOT public.writecheck_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF new_status IS NULL OR new_status NOT IN ('active','inactive','rejected') THEN RAISE EXCEPTION 'Invalid status.'; END IF;
  SELECT * INTO target FROM public."userTable" WHERE id::text = target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found.' USING ERRCODE = 'P0002'; END IF;
  IF target.role NOT IN ('student','teacher') OR target.id = auth.uid() THEN RAISE EXCEPTION 'Cannot approve yourself or manage an admin.' USING ERRCODE = '42501'; END IF;
  IF new_status = 'rejected' AND target.account_status <> 'pending' THEN RAISE EXCEPTION 'Only pending registrations can be rejected.'; END IF;
  IF target.account_status IS DISTINCT FROM new_status THEN
    UPDATE public."userTable" SET account_status = new_status WHERE id = target.id;
    INSERT INTO public.activity_logs(user_id, actor_name, actor_role, action, target_type, target_id, target_name)
      SELECT id, full_name, role, CASE WHEN new_status = 'rejected' THEN 'Rejected registration'
        WHEN new_status = 'active' AND target.account_status IN ('pending','rejected') THEN 'Approved registration'
        WHEN new_status = 'inactive' THEN 'Disabled account' ELSE 'Reactivated account' END,
        'userTable', target.id::text, target.full_name FROM public."userTable" WHERE id = auth.uid();
  END IF;
  RETURN jsonb_build_object('id', target.id, 'account_status', new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_registration_domain(), public.provision_pending_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_account_status(TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(TEXT,TEXT) TO authenticated;

-- Existing SECURITY DEFINER classroom mutations must also enforce active approval.
CREATE OR REPLACE FUNCTION public.archive_classroom(target_classroom_id UUID, should_archive BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID;
  caller_role TEXT;
  affected_rows INT;
BEGIN
  IF NOT public.writecheck_active() THEN RAISE EXCEPTION 'An approved active account is required.' USING ERRCODE = '42501'; END IF;
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM public."userTable" WHERE id = caller_id;

  IF caller_role = 'admin' THEN
    UPDATE public."classroomTable"
    SET is_archived = should_archive
    WHERE id = target_classroom_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
  ELSE
    UPDATE public."classroomTable"
    SET is_archived = should_archive
    WHERE id = target_classroom_id AND teacher_id = caller_id;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
  END IF;

  RETURN affected_rows > 0;
END;
$$;
CREATE OR REPLACE FUNCTION public.leave_classroom(target_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID;
  affected_rows INT;
BEGIN
  IF NOT public.writecheck_active() THEN RAISE EXCEPTION 'An approved active account is required.' USING ERRCODE = '42501'; END IF;
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public."classroomMembers"
  WHERE classroom_id = target_classroom_id
    AND student_id = caller_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_classroom(UUID,BOOLEAN), public.leave_classroom(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_classroom(UUID,BOOLEAN), public.leave_classroom(UUID) TO authenticated;
COMMIT;
