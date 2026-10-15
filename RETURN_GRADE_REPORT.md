# Return Grade investigation

## Findings and fix

First submissions passed the existing save/return frontend regression and the real SQL return path. Resubmissions also pass the SQL path once processing finishes. A resubmission-specific frontend defect was reproduced: an already-open review ignored changes to revision request/history, file, timestamp, grade, feedback, and returned state when the checked processing/text/report fields were unchanged. This left Return disabled by an obsolete revision request. Even when another field caused synchronization, grade/feedback inputs retained the previous attempt's values.

TeacherDashboard now synchronizes those fields, resets grade/feedback inputs when the attempt is replaced, preserves drafts during normal polling, avoids synchronization during saving, and copies the saved status into the review.

There was no incorrect submission ID in the traced requests: `/api/submissions/{id}/grade` and `return_submission(submission_key)` use the same canonical ID. Requested revisions update that row in place; historical attempts live in `submission_revisions.snapshot`. Tests verify the historical grade/text remain unchanged and no second canonical row is created.

The status transition is `submitted` to `graded`, with `returned_at` controlling publication. No new status or schema is needed. No database query or backend authorization defect was reproduced. Existing pending-revision and verified-processing guards remain in force. Processing must finish before Return is allowed.

## Changed files

- `src/pages/TeacherDashboard.js`: review synchronization, attempt draft reset, saved status.
- `src/pages/TeacherDashboard.workspace.test.js`: reproduced stale revision/button bug, correct canonical ID and latest grade/feedback payload, release failure and retry/input preservation.
- `scripts/test-revisions.cjs`: actual PostgreSQL first/revised return paths, repeated student reads, persisted grade/feedback/status/returned timestamp, historical snapshot preservation, notification idempotency.
- This report. No backend Python or SQL migration changes.

## Verification

The new stale-review test fails against the original TeacherDashboard and passes with the fix. Five selected frontend suites pass (77 tests), covering teacher/student workspaces, student submission, review, and progress synchronization. Backend persistence/access/status suites pass (27 tests). `node scripts/test-revisions.cjs` passes using isolated PostgreSQL/PGlite with the repository's real SQL functions and triggers.

Student reads after both returns show the latest grade and feedback, `graded` status and a returned timestamp, with no pending revision. Repeated reads verify database persistence independently of frontend state. Repeated Return calls do not add duplicate grade notifications; historical revision snapshots remain intact. Release failures retain inputs, show an error, and re-enable retry.

Both paths pass these automated checks. This is not a live production or real-account browser verification; deployed schema and provider processing health were not inspected. Unrelated existing workspace edits were preserved.

Production build: npm run build completed successfully. git diff --check passed.
