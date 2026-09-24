# WriteCheck Admin Workspace

The admin workspace monitors the existing academic tables. It does not submit,
create, scan, or grade student work. Class management is intentionally read-only:
the existing app has no archive lifecycle, so no archive/delete endpoint was added.

## Apply the database migration first

1. Back up your Supabase database and test on a development project.
2. Run `supabase_schema.sql`, then run `admin_schema.sql` in Supabase SQL Editor as
   the database owner. Deploy the frontend and backend together after the migration.
3. The migration extends conventional single-column student/teacher role CHECK
   constraints to include admin. If your hosted database has a custom role enum,
   add `admin` to that enum and commit before running this migration. Review any
   compound role constraints separately. The repository does not contain the
   original table DDL.

The live schema could not be inspected with the available publishable credential
(the schema endpoint returned 401). The migration uses the table/column relationships
already queried by the existing app. SQL and PL/pgSQL were parsed locally, but the
migration must still be exercised against your development database.

Added fields: `userTable.account_status` (active/inactive), `registered_at` (actual
Auth registration timestamp, NULL for SQL-only profiles without an Auth account).
Added table: `activity_logs`, with a whitelisted actor/action/target snapshot.
No duplicate user/class tables and no fabricated historical events are created.

Triggers record new registrations, classes, enrollments, assignments, and essay
submissions after migration. Status changes and their audit record commit in one
transaction. Existing historical registrations are shown using Auth timestamps.

Restrictive RLS policies add active-account requirements to academic tables and
private essay storage, preserving the existing ownership policies. The essay bucket
is made private because public bucket downloads bypass RLS. Existing signed URLs
can remain valid until expiry; already downloaded files cannot be recalled.
Existing profile/roster RPCs are updated to reject inactive users. Direct profile
role/status changes and profile deletion by browser clients are blocked.

## Create an admin for testing

Register a real account through WriteCheck and verify its email. Then run this
as the database owner, replacing the email with your registered test account:

```sql
UPDATE public."userTable" p
SET role = 'admin', account_status = 'active'
FROM auth.users a
WHERE p.id = a.id
  AND a.email = 'your-admin@example.com'
RETURNING p.id, p.full_name, p.email, p.role;
```

The query must return one row. If it returns none, sign in once to create the
profile, then retry. Sign out and sign in again. Never add an admin role option
to the public registration form or rely on Auth user metadata to grant admin.

## Local configuration and startup

Backend `backend/.env` (use the same project as `src/supabaseClient.js`):

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PROJECT_PUBLISHABLE_KEY
```

Frontend `.env.local`:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

No service-role credential is required for the admin API. Existing OCR model and
backend dependency setup still applies; see the main README. Run `npm start` and
`npm run start:backend`. Open `/admin/dashboard` as the admin account.
The deployment host must serve the React app for `/admin/*` paths on refresh.

## Routes and authorization

React: `/admin/dashboard`, `/admin/users`, `/admin/classes`,
`/admin/activity-logs`, `/admin/profile`. `/admin` redirects to the overview.

The shared dashboard loader reads `current_account()` rather than trusting
editable user metadata. Admins entering `/dashboard` redirect to the admin
workspace; students/teachers entering an admin route redirect to their workspace.
Inactive accounts render a blocked-access screen. Account state refreshes on
window focus and every 30 seconds. Database/backend checks apply on every request,
even before the UI's next refresh.

FastAPI verifies the bearer token with Supabase Auth `/auth/v1/user`, then reads
the authoritative role/status via `current_account`. Every admin endpoint requires
an active admin. It forwards the same user token to RPCs that independently check
admin privileges. No frontend `admin` value or service key is trusted.

New endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | Actual totals, recent registrations and events |
| GET | `/api/admin/users` | Search, role/status filters, 25-row pages |
| GET | `/api/admin/users/{id}` | Safe profile fields and academic counts |
| PATCH | `/api/admin/users/{id}/status` | Disable/reactivate student or teacher |
| GET | `/api/admin/classes` | Class/teacher search and 25-row pages |
| GET | `/api/admin/classes/{id}` | Class details and enrolled students |
| GET | `/api/admin/activity-logs` | User/action search, role, UTC date, pages |

New RPCs: `current_account`, `admin_read(section, filters)`,
`admin_set_account_status(target_user_id, new_status)`, plus boolean policy helpers.
Administrative reads expose only selected fields, not auth secrets or essay bodies.

Existing `/api/*`, upload, and download operations now require an active session;
frontend backend calls use `apiFetch` to supply it only to configured backend/OCR
origins. Admins cannot use academic backend operations. The existing Copyleaks
callback remains outside user-session authentication to preserve provider delivery;
its original callback validation is unchanged. This change does not constitute a
full security audit of all legacy backend endpoints or hosted functions/policies.

## Files

Created: `admin_schema.sql`, `backend/admin_api.py`, `backend/test_admin_api.py`,
`src/apiFetch.js`, `src/apiFetch.test.js`, `src/pages/AdminDashboard.js`,
`src/pages/AdminDashboard.test.js`, `scripts/test_admin_database.cjs`, and this guide.

Modified: `src/App.js` (admin routes), `src/pages/Dashboard.js` (database role/status
gate), `backend/main.py` (router and account guard), and existing dashboard/service
fetch calls in StudentDashboard, TeacherDashboard, shared, ocrService and
plagiarismScan (authenticated backend transport). The student/teacher UI workflows
were not redesigned. ProfileEditor is reused for admin profile editing.

## Verification

```powershell
npm test -- --watchAll=false --runInBand
npm run build
cd backend
python -m unittest test_admin_api -v
```

React and API tests mock Supabase. `scripts/test_admin_database.cjs` executes the
real migrations, RPCs, audit triggers and RLS in disposable PGlite PostgreSQL using
representative base tables. Run it with:

```powershell
npm install --prefix "$env:TEMP/writecheck-sql-validation" --no-save --package-lock=false @electric-sql/pglite
$env:PGLITE_MODULE = "$env:TEMP/writecheck-sql-validation/node_modules/@electric-sql/pglite"
node scripts/test_admin_database.cjs
```

These checks do not prove the hosted schema matches the fixture or test live Auth
email/login. After applying the migration, test with real accounts:

1. Log in as each role and refresh its workspace. Verify normal student and teacher
   classroom, submission, preview, OCR, and grading workflows still work.
2. Visit `/admin/users` directly as student/teacher; verify redirection and that a
   direct admin API request with that user's token returns 403 (missing token: 401).
3. Compare overview totals with table counts. Search users by name/email and filter
   role/status; search classes by class/teacher; open user and class details.
4. Cancel a disable confirmation and verify nothing changed. Confirm it and verify
   a single audit event, inactive status, and 403 on that user's next backend call.
   Test direct Supabase reads/writes with the inactive session too.
5. Reactivate and verify access returns without deleting any academic records.
   Admin accounts cannot be disabled via this endpoint.
6. Register a test user, create a class/activity, enroll, and submit. Verify real
   events appear, then filter logs by role, user, and UTC date.
7. Change the admin's name; reload and verify persistence. Email and role remain
   read-only. Try changing a student profile's role/status through a direct table
   update and verify the database rejects it.

Review any additional hosted SECURITY DEFINER RPCs and custom Auth signup triggers
not included in this repository: they must not accept role changes from user
metadata or bypass the new inactive-account restrictions.
