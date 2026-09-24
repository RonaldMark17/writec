# Confirmed submission result saving

Submission grades, feedback, transcripts and scan results now use `submissionTable`
in Supabase as the source of truth. The backend writes with the teacher's session
and requires exactly one returned row before reporting success. No service-role
key or new migration is required; the existing schema, admin and submission-security
migrations must already be installed.

Restart the backend and refresh the frontend after updating. As a teacher:

1. Open a submitted assignment, save a grade and feedback, then refresh and reopen it.
2. Confirm the values remain and are visible from the student's account under the
   existing visibility rules. Delayed release is a separate upcoming feature.
3. Stop the backend, attempt another save, and verify an error appears inside the
   review window, which remains open with your values. Restart and retry.
4. Save scan results and refresh. Rescanning must not erase an existing grade.

Failed writes are retried explicitly from the open form. There is no offline queue:
closing or refreshing the page discards unsaved edits. A timed-out write may have
committed; refreshing verifies its state and retrying repeats the same update.

The results endpoint reads Supabase rather than falling back to stale SQLite data.
Legacy SQLite grade synchronization is disabled, including writes to the old
`submission_grades` mirror. Startup synchronization handles standalone scans only. Existing
local-only results are not automatically migrated, because they could overwrite
newer grades; reconcile those separately. Standalone plagiarism scan history still
has its legacy synchronization and is not converted by this change.

Local verification covers backend persistence failures and permissions plus the
frontend build. Live Supabase save-and-refresh tests must be performed with real
test accounts; they have not been run by the coding agent.
