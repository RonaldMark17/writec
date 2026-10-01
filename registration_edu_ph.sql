-- Apply after registration_approval.sql to also accept institutional .edu.ph domains.
BEGIN;
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

COMMIT;
