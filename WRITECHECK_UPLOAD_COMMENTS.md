# Document uploads and student comment notifications

File mode now permits only PDF, DOC, and DOCX selection. Shared browser validation checks extension, available MIME type, and signatures before saving a selection or creating a preview. Invalid choices leave the previous valid file intact, reset the input, and display a persistent accessible warning. Student submission, teacher Scan Station/change-file controls, and the landing demonstration share this policy. Picture mode retains image validation and OCR. Pasted-text submissions remain a separate TXT-based workflow.

Legacy DOC processing was already unsupported. DOC can be selected when its signature matches, but processing stops with an explicit instruction to save as PDF or DOCX. This change does **not** claim working DOC text extraction. PDF and DOCX processing remains supported. Backend checks parse PDF and Word package structure and reject unsupported/renamed files before extraction, similarity processing, or submission enqueueing. Existing saved originals remain viewable.

Student Class Comments and Private Comments produce separate teacher notifications transactionally. Metadata identifies the student, assignment, classroom, comment, and visibility; private comment text is not copied into notifications. Recipient RLS and current teacher authorization prevent other students or former teachers from reading these events. Teacher replies do not notify the teacher. The existing restriction against teacher Class Comment posting is preserved.

The comment RPC accepts an optional request_id UUID. The new frontend reuses it after an uncertain failure; the database serializes matching retries and returns the original comment. Unique event keys prevent duplicate notifications for that comment. Callers implementing retries should retain request_id across retries. Requests with the same ID but different content are rejected.

All/Unread/Read filters and read acknowledgement remain intact. Category filters add Comments, Assignments, Submissions, and Grades / Feedback. Both the bell and full page identify Class Comment versus Private Comment. Opening a comment refreshes assignment access, acknowledges the event using the existing flow, and focuses the matching comments section; private events select the authorized student conversation.

## Deployment

Apply `student_comment_notifications.sql` to Supabase **after** `comment_visibility.sql` and `in_app_notifications.sql`, and **before** deploying the updated frontend. It adds retry identity, expands notification types, installs the comment trigger, updates the RPC signature, and strengthens notification RLS for comment events. It is safe to reapply and does not backfill old comments. This migration has been exercised locally with PostgreSQL-compatible PGlite; it has not been applied to a remote Supabase project.

Deploy the backend changes with the frontend so File-mode requests receive the new validation. No OCR model, Copyleaks provider, similarity algorithm, grade, enrollment, or assignment-deletion changes are required.

## Verification

- Full frontend suite: 57 suites passed, 400 tests passed (`npm test -- --watchAll=false --runInBand --silent`).
- Backend: 53 selected tests passed, covering document validation/endpoints, submission intake, image bundles, existing document extraction, and similarity-provider rejection before processing.
- Database: `node scripts/test-comment-notifications.cjs` passed, including retry identity, failed insertion, teacher self-notification exclusion, student privacy, unread/read behavior, migration reapplication, and ownership changes.
- Responsive browser checks: notification page and bell passed at 1280px, 600px, and 360px, including long text, dropdown bounds, and light/dark colors (`node scripts/test-notification-layout.cjs`).
- Production build: `npm run build` passed; existing unrelated lint warnings remain.

## Changed files

- `WRITECHECK_UPLOAD_COMMENTS.md`
- `backend/document_validation.py`
- `backend/main.py`
- `backend/submission_intake.py`
- `backend/test_document_validation.py`
- `backend/test_manual_plagiarism.py`
- `backend/test_submission_intake.py`
- `scripts/test-comment-notifications.cjs`
- `scripts/test-notification-layout.cjs`
- `src/pages/LandingDemo.js`
- `src/pages/LandingDemo.test.js`
- `src/pages/StudentDashboard.js`
- `src/pages/StudentDashboard.submission.test.js`
- `src/pages/TeacherDashboard.js`
- `src/pages/TeacherDashboard.workspace.test.js`
- `src/pages/dashboard/AssignmentComments.js`
- `src/pages/dashboard/AssignmentComments.test.js`
- `src/pages/dashboard/Notifications.js`
- `src/pages/dashboard/Notifications.test.js`
- `src/pages/dashboard/documentFiles.js`
- `src/pages/dashboard/documentFiles.test.js`
- `src/pages/dashboard/notifications.css`
- `src/pages/dashboard/plagiarismScan.js`
- `src/pages/dashboard/plagiarismScan.test.js`
- `src/pages/dashboard/useSubmissionTranscription.js`
- `student_comment_notifications.sql`
