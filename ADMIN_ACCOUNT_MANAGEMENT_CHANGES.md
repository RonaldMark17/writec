# Admin approvals and direct account creation

## What changed

- `src/pages/AdminDashboard.js`: dedicated **Pending Approvals** navigation/page, server-filtered search and pagination, existing Approve/Reject confirmation actions, dashboard pending count, and **Create account** modal. The modal collects name, institutional email, student/teacher role, and an 8–128 character password. It clears the password on success/close and refreshes listings after changes.
- `backend/admin_api.py`: `POST /api/admin/users` verifies an active admin, validates fields/domain/role, creates the account through Supabase Auth using the backend service key, then approves through the existing caller-authorized RPC. It never replaces the browser session, exposes a service key, or returns a password. The dashboard now counts all pending registrations. Duplicate emails get an actionable error; if creation succeeds but approval fails, the response explicitly reports partial completion instead of suggesting another creation attempt.
- `admin_registration_repair.sql`: separate, repeatable data repair for qualifying Auth users with no profile. Creates pending student/teacher profiles, restores missing registration timestamps, and preserves every existing account status. It does not introduce tables or columns, create admin accounts, or reset existing accounts to pending.
- Tests: `src/pages/AdminDashboard.test.js`, `backend/test_admin_api.py`, `scripts/test_approval_comments.cjs`.

## Why an account may have been absent

The former overview showed only the five most recent registrations. There was no separate queue, although Users already supported a pending-status filter. Admin queries read `userTable`; an Auth account without a profile cannot appear there. The approval migration provisions future registrations but does not backfill earlier missing profiles. The new queue and separate repair address these cases. The live project's data and installed migrations have not been inspected, so a specific live account's cause is not confirmed.

An existing active account remains active and appears under Users, not Pending Approvals. Repair only includes eligible `@edu.com.ph` and `.edu.ph` email addresses with student/teacher (or absent) role metadata. A failed signup with no Auth account cannot be recovered by this repair.

## Deployment

1. Apply the current `registration_approval.sql` after its admin/security prerequisites. If the older approval migration is already installed, also apply `registration_edu_ph.sql` for the updated domain rule.
2. Run `admin_registration_repair.sql` in the Supabase SQL Editor after those migrations. Do not rerun older security migrations afterward, as they can replace the approval functions.
3. Ensure `backend/.env` contains the actual server-only `SUPABASE_SERVICE_ROLE_KEY`, then restart the backend and deploy/reload the frontend. No `.env` settings were changed by this work.
4. Open **Admin → Pending Approvals** and click **Refresh**. Existing approved accounts can be found under **Users**.

Direct admin-created accounts are approved and email-confirmed; the form explicitly states this. The administrator should verify the supplied address and share the password securely. No email is sent automatically. Ordinary self-registration still requires approval and follows the existing email-verification flow. The server implementation follows [Supabase's admin create-user contract](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## Verification

- 20 admin frontend tests passed, including both account roles, queue filtering/approval, failed creation, and existing route restrictions.
- 17 backend admin tests passed, including unauthorized/disabled caller denial, invalid domain/admin-role/password rejection, missing configuration, duplicate errors, server-key isolation, and partial completion.
- Isolated PostgreSQL tests passed: missing-profile repair is repeatable; repaired accounts appear in the actual pending admin query; existing approved status is preserved; non-admin reads are denied; repaired accounts can be approved.
- Production build passed with existing unrelated lint warnings; `git diff --check` passed.
- No live accounts were created, live migrations applied, or real emails sent.

## Manual acceptance checks

1. Register a new eligible student and teacher. Refresh Pending Approvals and verify both appear even when they are outside the overview's latest five registrations.
2. Approve one and reject the other. Verify each leaves the pending queue, the approved account can enter its workspace, and the rejected account cannot.
3. For an eligible Auth account missing a profile, run the repair and verify it appears as pending. Verify existing active/inactive/rejected accounts retain their status.
4. From Users, create one student and one teacher. Verify each appears as active, can sign in with the specified password, and opens the correct workspace. Verify the admin remains signed in.
5. Try a duplicate email, invalid domain, short password, and missing backend key. Verify clear errors and no false success. Students/teachers must receive 403 when directly calling the creation endpoint.
6. If creation reports that approval could not finish, do not create it again. Refresh the queue, repair a missing profile if necessary, and approve the existing account.
