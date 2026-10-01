-- Apply AFTER registration_approval.sql (and registration_edu_ph.sql if needed).
-- Restores eligible Auth accounts missing a profile. Existing profiles/statuses are preserved.
BEGIN;
INSERT INTO public."userTable" (id, full_name, email, role, account_status, registered_at)
SELECT a.id, COALESCE(NULLIF(trim(a.raw_user_meta_data->>'full_name'), ''), a.email), a.email,
  CASE WHEN a.raw_user_meta_data->>'role' = 'teacher' THEN 'teacher' ELSE 'student' END,
  'pending', a.created_at
FROM auth.users a
WHERE lower(a.email) ~ '^[^[:space:]@]+@(edu[.]com[.]ph|([a-z0-9]([a-z0-9-]*[a-z0-9])?[.])+edu[.]ph)$'
  AND COALESCE(a.raw_user_meta_data->>'role', 'student') IN ('student', 'teacher')
  AND NOT EXISTS (SELECT 1 FROM public."userTable" u WHERE u.id = a.id)
ON CONFLICT (id) DO NOTHING;

-- Older profiles without a registration date must not disappear from recent registrations.
UPDATE public."userTable" u SET registered_at = a.created_at
FROM auth.users a WHERE u.id = a.id AND u.registered_at IS NULL;
COMMIT;
