-- Apply after registration_approval.sql and registration_edu_ph.sql.
-- Protect direct Auth signup too; existing accounts are not changed.
-- Supabase Auth validates passwords. Confirm-password is a browser-only check
-- and must never be saved in user metadata or a database table.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_registration_required_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(NEW.email, '') !~ '[^[:space:]]'
    OR COALESCE(NEW.raw_user_meta_data->>'full_name', '') !~ '[^[:space:]]'
    OR COALESCE(NEW.raw_user_meta_data->>'role', '') NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Full name, email address, and a student or teacher role are required for registration.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS writecheck_registration_required_fields ON auth.users;
CREATE TRIGGER writecheck_registration_required_fields BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_registration_required_fields();
REVOKE ALL ON FUNCTION public.enforce_registration_required_fields() FROM PUBLIC, anon, authenticated;
COMMIT;
