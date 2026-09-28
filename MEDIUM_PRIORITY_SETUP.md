# Medium-priority functionality

Implemented locally; no database migration or deployment is required for these changes.

## Profiles and automatic checks

Profile name still uses the existing `update_my_profile` RPC. Other fields and
preferences now save to Supabase Auth `user_metadata.writecheck_preferences`.
The dashboard refreshes metadata from Auth, so saved settings follow the account
across browsers. Existing browser-only settings are used until the first cloud
save. Open Profile and save once to migrate them. A failed preference save shows
an error; a successful name save is not rolled back if the later preference save
fails. Avatar changes remain previews until Save profile.

Only an allowlist of non-privileged fields is loaded from preferences. Role,
account status, email and identity continue to come from the account RPC.

For automatic submission checks, the backend finds the assignment's teacher and
reads that teacher's saved settings. It snapshots settings in the job checkpoint:

- Strict: review suggested at 5% similarity.
- Standard: review suggested at 10% similarity.
- Permissive: review suggested at 20% similarity.
- At 50% and above, all settings show high review.
- The provider's percentage is never adjusted by these settings.
- Disabling peer comparison skips the classroom query and displays it as disabled,
  not as a 0% result. Classroom-only mode fails explicitly if peer comparison is
  disabled, since no check would remain.

Completed results keep their snapshot. New checks use current preferences;
resuming a failed job can reuse its original checkpoint. To use new settings on
an already completed result, request a new check. The separate legacy manual
plagiarism checker remains an open critical audit finding.

## Service status

Profile Preferences loads authenticated `/api/preferences/services`. It shows
provider authentication/credit status, sandbox mode, loaded OCR models, and email
configuration. Loaded models do not guarantee transcription accuracy; SMTP
configuration does not prove delivery. An unavailable request displays an error,
not a connected badge.

## Optional email dispatcher

Email is **disabled by default**. No SMTP host is configured in the current local
environment, so email controls are disabled and no messages were sent during
implementation. To enable later, configure `backend/.env`:

```dotenv
NOTIFICATIONS_ENABLED=1
SMTP_HOST=<your SMTP host>
SMTP_PORT=587
SMTP_FROM=<verified sender address>
SMTP_USER=<SMTP username>
SMTP_PASSWORD=<SMTP password>
SMTP_SSL=0
APP_URL=http://localhost:3000
# Optional absolute path on persistent disk:
# NOTIFICATIONS_DB=C:/persistent/writecheck-notifications.db
```

Use `SMTP_SSL=1` and port 465 for implicit TLS; otherwise STARTTLS is required.
The existing server-only Supabase service key is used. Never put credentials in
frontend environment variables or commit them. Restart the backend after setup.
Supabase Auth SMTP only sends authentication emails; it does not configure this
dispatcher. A Gmail configuration template is in `backend/.env.smtp.example`.
Copy its settings into `backend/.env`, replacing placeholders with your sender
and Google App Password; retain your existing Supabase service-role key. Set
`APP_URL` to your deployed frontend URL for the link included in assignment emails.

Run the dispatcher on **one backend only**. Each teacher then opts in through
Profile Preferences and saves:

- Submission notifications: one email per new saved submission, independent of
  whether the API check has finished.
- Weekly submission digest: one count summary on Monday UTC for teachers with
  submissions in the previous seven days. It does not invent or email scan scores.

New assignments also generate an email for each currently enrolled, active student
with a confirmed Auth email. These classroom notices are automatic while the
dispatcher is enabled and do not depend on the teacher's submission-alert preference.
They include the class, title, instructions, due date, and optional application link.
Assignment creation is the publication event in the current system; editing an
assignment does not send another notice. Membership is checked at delivery time,
so a student joining during the seven-day window may receive a recent assignment.
Each assignment/student pair has its own persistent delivery receipt.

Only active teachers with a confirmed Auth email receive teacher alerts. The dispatcher
polls every minute and retries failed deliveries. Persistent SQLite receipts
prevent normal duplicate delivery across restarts. Keep the receipts file; it is
ignored by Git. SMTP acceptance and the receipt commit cannot be atomic, so a
crash immediately after acceptance can cause a duplicate. Multiple dispatchers
with separate receipts are unsupported. There is no backlog before the first
activation; failed deliveries expire from the seven-day polling window. A missed
Monday digest is not backfilled later in the week. Emails contain no essay text.

Live SMTP delivery needs a configured sender and a real acceptance test. Unit
tests use a mocked sender and never send email.

To verify setup, restart the backend with SMTP enabled, then post a new assignment
in a class with a confirmed student account. Allow a polling interval (60 seconds,
plus delivery time), check the student's inbox, and confirm the next poll does not
send a duplicate. Keep the backend running for notifications to be delivered.

## Mixed-content PDFs

Every page now extracts both its selectable text and its embedded images using
OCR. Exact normalized duplicates are removed within a page. This fixes the prior
case where a typed heading caused handwritten image content to be skipped.
Complex layouts, image ordering, near-duplicate OCR layers, and handwriting
represented as vector paths still need review; this is not a full page-rendering
or layout reconstruction engine. Extraction failures remain explicit.
