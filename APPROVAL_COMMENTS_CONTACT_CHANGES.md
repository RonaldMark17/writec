# Comments, registration approval, and Contact Us

## Changes and files

| Area | Files | Result |
| --- | --- | --- |
| Assignment comments | `src/pages/dashboard/AssignmentComments.js`, `comment_visibility.sql` | Separate Class Comments and Private Comments, teacher conversation selector and private replies; existing comments remain private. |
| Registration | `src/pages/AuthModal.js`, `registration_approval.sql` | Case-insensitive @edu.com.ph or institutional domains ending in .edu.ph, server-provisioned pending profiles. |
| Workspace access | `src/pages/Dashboard.js`, `backend/admin_api.py` | Authoritative profile/status required; no active-account fallback from session metadata or browser preferences. |
| Admin approval | `src/pages/AdminDashboard.js`, `backend/admin_api.py`, `registration_approval.sql` | Pending/rejected filters and Approve/Reject actions, using the existing status endpoint/RPC. |
| Contact UI | `src/pages/Contact.js`, `src/pages/Startup.js`, `src/App.js` | The existing Contact link now opens `/contact` instead of the placeholder mailto address. Inspection found no existing Contact form. |
| Contact delivery | `backend/contact_api.py`, `backend/notifications.py`, `backend/main.py`, `backend/.env.smtp.example` | Public validated form endpoint, configurable fixed recipient, existing SMTP/TLS transport, optional Reply-To and SMTP_USERNAME alias. |
| Tests | `src/pages/{AuthModal,AdminDashboard,Contact}.test.js`, `src/pages/dashboard/AssignmentComments.test.js`, `src/pages/StudentDashboard.workspace.test.js`, `backend/test_admin_api.py`, `backend/test_contact_api.py`, `scripts/test_approval_comments.cjs` | Component, API and PostgreSQL checks for the new behavior and bypass attempts. |

Earlier classroom, submission, grade-export and archive improvements remain in the working tree. No live schema changes or `.env` edits were made.

## SQL migrations and deployment

Apply these separate migrations as the database owner before deploying the updated frontend/backend:

1. `registration_approval.sql`, after `admin_schema.sql` and the existing security migrations.
2. `comment_visibility.sql`, after `assignment_comments.sql` (and its existing prerequisites).

Do not rerun older migrations afterward: some older definitions/defaults would undo the new behavior. The migrations are transactional and were tested in an isolated PostgreSQL fixture. They have not been applied to the live project.

`registration_approval.sql` extends the existing `account_status` check to `pending`, `active`, `inactive`, `rejected`; it does not reset existing account statuses. An Auth BEFORE INSERT trigger enforces the approved domain and an AFTER INSERT trigger provisions a pending profile. The existing profile guard prevents self-activation or role escalation. Existing archive/leave RPCs now also require an active approved account.

`comment_visibility.sql` adds `visibility` and `sender_id` to the existing comment table. Existing rows are backfilled as **private**, preserving their original confidentiality. `student_id` identifies the student conversation owner for private comments; `sender_id` identifies the actual student/teacher author.

## Comment security

Both read and post RPCs validate the assignment/classroom pair and the current account's actual classroom access. Direct browser table privileges remain revoked with RLS enabled.

Class comments are readable only by enrolled students and the owning teacher. Students can post class comments; teacher class posting is not added. Private comments are readable only by their student conversation owner and the classroom teacher. A teacher chooses the recipient student, and the RPC validates that student's enrollment. The sender identity always comes from `auth.uid()`. Students cannot provide another student's identity. Comments retain profile-derived sender names and server timestamps.

The existing `list_assignment_comments` RPC is extended. The `post_assignment_comment` RPC accepts optional `comment_kind` and `recipient_student_id`; omitted type defaults to private for compatibility with the former student-only posting call.

## Registration and approval

The frontend trims/lowercases registration email and checks the exact domain. The database independently checks new `auth.users` inserts, so direct Supabase signup requests and other new-account creation paths cannot bypass it. `USER@EDU.COM.PH` is allowed; Gmail, suffix lookalikes and subdomains are rejected. Existing accounts retain their status and can still sign in; this is a new-registration restriction, not a retroactive account disablement.

New student and teacher profiles are always pending, ignoring a client-supplied active status. Admin > Users supports role and Pending approval filters. Approve changes status to the existing `active` value; Reject changes it to `rejected`. Existing Disable/Reactivate controls remain available. The existing `PATCH /api/admin/users/{id}/status` and `admin_set_account_status` RPC enforce administrator access, reject self-management/admin targets, and log status changes.

Email confirmation and administrator approval are separate: an account must satisfy both normal Supabase authentication requirements and active profile status. Pending/rejected users see an explanatory workspace message. Protected FastAPI operations, academic-table RLS, storage restrictions and checked RPCs continue to require `writecheck_active()`. The dashboard no longer invents an active profile if database verification fails, and browser preferences cannot override role, ID or status.

## Contact Us and configuration

`POST /api/contact` accepts `name`, `email`, `subject`, and `message`. It is intentionally public, so visitors and pending users can request help. Server validation rejects blank/invalid/overlong fields. A bounded per-process IP limit allows five messages per ten minutes. The frontend disables Send while pending and prevents duplicate in-flight submissions.

The server calls the existing SMTP sender over TLS. The fixed recipient comes only from configuration. The visitor email is Reply-To; the authenticated SMTP sender remains From. User subject/message content goes in the body, with a fixed email subject. Success is returned only after SMTP accepts the message. Configuration and delivery failures return useful errors without credentials.

Fill these in **backend/.env**, then restart the backend (do not put credentials in REACT_APP variables):

```dotenv
CONTACT_RECIPIENT_EMAIL=the-gmail-address-you-will-provide
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SSL=1
SMTP_FROM=your-sending-address@gmail.com
SMTP_USERNAME=your-sending-address@gmail.com
SMTP_PASSWORD=your-app-password
```

`SMTP_USER` remains supported for the existing notification setup; `SMTP_USERNAME` takes precedence when supplied. For STARTTLS use the appropriate host, `SMTP_PORT=587`, and `SMTP_SSL=0`. Contact delivery does not require `NOTIFICATIONS_ENABLED=1`; that flag still controls scheduled classroom notifications. Changing the recipient requires only a backend configuration update/restart, no frontend change.

The final recipient was intentionally left unset in the example. No real email was sent during tests.

## Validation

- Full frontend run: **27 suites, 123 tests passed**. A subsequent 16-test admin/workspace run passed after the final account-ID verification check.
- Backend: **4 Contact API**, **11 admin API**, **10 existing medium-feature**, and **5 existing assignment-notification** tests passed (30 total).
- Actual SQL migrations and authorization functions executed in isolated PostgreSQL/PGlite: legacy comments remain private; classmates see class comments; private replies stay in the chosen conversation; other classes are denied; invalid registration domains are rejected; both new roles start pending; self-activation/self-approval fail; approval/rejection controls access; existing active accounts retain their status.
- Production build succeeds with existing lint warnings. Modified Python modules compile successfully.
- No live Supabase migration, real SMTP delivery, or live authenticated browser acceptance run was performed. Those checks require deploying the migrations and filling the recipient/SMTP configuration.

## Manual acceptance checklist

1. Enroll students A and B in one classroom. A posts a Class Comment in Assignment A. B and its teacher should see the sender, text and timestamp.
2. Open another assignment and another classroom; Assignment A's comment must not appear. A non-enrolled account's direct RPC call must fail.
3. A posts a Private Comment. Only A and the teacher should see it; B must not receive it in the RPC response.
4. The teacher selects A under Private Comments and replies. A sees the teacher's name and reply; B does not. Repeat with B to verify separate conversations.
5. Register with a mixed-case `user@EDU.COM.PH` address. Verify the profile is created with `pending`, including when Supabase issues a session immediately.
6. Register with Gmail and `user@edu.com.ph.evil.com`. Verify frontend rejection and repeat through direct Supabase signup to confirm the database restriction.
7. Log in as a pending student. Verify the approval message, no normal workspace, and denial from protected APIs/database operations.
8. Approve that student in Admin > Users. Retry/sign in and verify student workspace access.
9. Repeat registration/approval with a teacher account. It must remain pending until approved.
10. Reject another pending account. Verify the rejected message and direct API denial; a non-admin must not be able to call the approval API/RPC.
11. Configure the recipient/SMTP settings and submit Contact Us. Verify one email arrives with the entered fields and correct Reply-To. Verify a send failure does not show success.
12. Change only CONTACT_RECIPIENT_EMAIL and restart the backend. Verify delivery to the new recipient without frontend changes.
13. Submit empty/whitespace fields or an invalid email; verify no email is sent. Double-click Send during a delayed response and verify only one request.

## Additional institutional domains

Registration also accepts student@school.edu.ph and subdomains, case-insensitively. Existing @edu.com.ph eligibility and pending approval remain. Frontend and database reject lookalike suffixes. Existing installations: apply registration_edu_ph.sql after registration_approval.sql. New installations can use the updated registration_approval.sql directly. No live migration was applied.
