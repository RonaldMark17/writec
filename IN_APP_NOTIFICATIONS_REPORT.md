# WriteCheck in-app notifications

Implemented for Student and Teacher workspaces. The SQL migration is ready but has **not been applied to a live Supabase project**. Existing email delivery and backend configuration are unchanged.

1. **Files modified / added**
   - `in_app_notifications.sql`: notification table, indexes, RLS, read RPC, transactional event triggers.
   - `src/pages/dashboard/Notifications.js`: shared count hook, bell, dropdown, paginated notification page.
   - `src/pages/dashboard/notifications.css`: theme-aware desktop/mobile styles.
   - `src/pages/dashboard/shared.js`: notification slot in the shared header.
   - `src/pages/StudentDashboard.js`: bell/page integration and exact assignment/submission navigation; also restores the missing `useRef` import used by the existing data loader.
   - `src/pages/TeacherDashboard.js`: bell/page integration and exact submission review navigation.
   - `src/pages/dashboard/Notifications.test.js`: notification component and hook tests.
   - `src/pages/StudentDashboard.workspace.test.js`: student notification navigation tests and mock support.
   - `src/pages/TeacherDashboard.workspace.test.js`: teacher notification navigation test and mock support.
   - `scripts/test-revisions.cjs`: PostgreSQL integration coverage for notification events, retries, permissions, and returned feedback.
   - `scripts/test-notification-layout.cjs`: actual component markup and compiled CSS checked in headless Edge.
   - `IN_APP_NOTIFICATIONS_REPORT.md`: this report and deployment instructions.

2. **Database/table changes**: `public.notifications` stores UUID identity and recipient, stable event type, title/message, classroom/assignment/submission references, small metadata, event key, read flag/time, and creation time. Recipient deletion cascades. No submitted essays, grade values, feedback bodies, or scan reports are copied into notifications.

3. **Migration/RLS**: repeatable transaction with recipient/event uniqueness, chronological and partial unread indexes, recipient-only SELECT policy, current classroom access checks, and protected `mark_notifications_read(UUID)` RPC. Trigger and helper functions use a fixed empty search path and qualified tables.

4. **Generated notification types**: `assignment_created`, `assignment_updated`, `resubmission_requested`, `grade_posted`, `submission_created`, `submission_resubmitted`. `feedback_added` is reserved and supported in the UI/schema; this application returns feedback together with grades, so a combined notification is emitted instead of two separate rows.

5. **Student events**: new assignments, meaningful assignment updates, requests to revise their own work, and newly returned grades/feedback.

6. **Teacher events**: initial student submissions and completed teacher-requested revisions. Optional classroom comment notifications are not included. Failed-processing retries do not masquerade as completed teacher-requested revisions.

7. **Assignment generation**: an AFTER INSERT trigger fans out to active student members of the assignment's classroom. It excludes the assignment author. AFTER UPDATE emits only when title, instructions, or due date actually changes. No frontend notification insertion is used.

8. **Resubmission requests**: inserting the protected revision record notifies only its submission's student. The notification preserves classroom, assignment, submission, and revision-request IDs. The teacher's note is read from the existing protected revision history on the destination assignment page.

9. **Student resubmissions**: the revision record's first transition to a non-null completion time notifies the classroom owner. This runs inside the existing submission RPC transaction; rollback also rolls back the notification. Initial submission inserts use the distinct `submission_created` type.

10. **Grades/feedback**: notifications are emitted when `returned_at` changes to a non-null value and the existing report-verification gate passes. Draft grade/feedback saves emit nothing. Work with feedback gets the title “Grade and feedback available.” Feedback updates notify on the next explicit return. Repeated return clicks do not duplicate the event. Sensitive details are fetched through existing permission-checked submission flows.

11. **Unread count**: an indexed Supabase exact count with `head: true`, recipient filter, and unread filter. The count request downloads no notification history. The badge shows `9+` above nine, and the accessible bell label reports the actual count.

12. **Dropdown**: five newest notifications, readable unread labels, relative times, mark-all-read, and View all notifications. Includes local loading, empty, error/retry, Escape dismissal, initial keyboard focus, outside dismissal, and visible focus styles. Uses the project's existing inline SVG icon convention.

13. **View All page**: Type, Classroom, Notification, Date/Time, Status, Action. All/Unread/Read filters; 20 rows per server-side page; newest-first deterministic ordering; existing pagination controls. Filter changes reset the page. Absolute dates use the browser's local timezone.

14. **Read/unread**: successful opening resolves fresh authorized destination data, persists read status, then navigates. Read failure keeps the notification open with an error. Mark all updates only currently accessible unread rows belonging to the caller. Neither operation deletes history.

15. **Duplicate prevention**: unique recipient/event keys use assignment or submission IDs, revision-request IDs, and return timestamps. Update events are generated only for actual value transitions; no-op retries generate nothing. Existing locked/idempotent revision RPCs prevent repeated request/completion events. Worker polling and React renders never insert notifications.

16. **Navigation/context**: both dashboards quietly reload authorized data before resolving IDs. Students open the exact assignment or their submission detail; teachers open the exact assignment and student's review with grading inputs initialized. Missing/deleted/inaccessible destinations produce an error instead of silently navigating to a generic dashboard. Classroom, assignment, and submission IDs must match together.

17. **Refresh strategy**: quiet 30-second count refresh while visible, plus focus/visibility return refresh. Open lists refresh alongside the count. Existing rows remain visible during background refresh. Timers/listeners are cleaned up, and stale requests are ignored. Supabase realtime publication changes are not needed.

18. **Privacy**: authenticated users can SELECT only their own notifications while their account is active and they still have classroom access. Leaving a class revokes access to its notifications. Anonymous access and direct authenticated INSERT/UPDATE/DELETE are denied. Read changes go through a constrained RPC; content, recipients, and event keys cannot be changed by the frontend. No service-role secret is sent to the browser.

19. **Dark/mobile behavior**: shared workspace/accent variables drive colors. Unread status has explicit text and heavier titles. Below 768px the table becomes stacked cards with field labels. The dropdown is viewport-bounded. Edge checks passed at exact 1280px, 600px, and 360px widths, including long unbroken titles, no horizontal overflow, dropdown bounds, and light → dark → light restoration.

20. **Tests added/updated**: component tests cover badge, focus/Escape, read acknowledgement ordering/failure, filters, pagination, empty/error recovery, HEAD count, focus refresh, and cleanup. Dashboard tests cover student revision note, returned grade detail, and a teacher opening a submission that arrived after initial dashboard load. Database tests exercise real revision RPC retries, recipient isolation, draft/returned grade behavior, feedback return, unauthorized writes, mark-one/all, no self-notifications, membership restrictions, and migration reruns.

21. **Validation results**:
   - `npm run test:revisions`: PASS, existing revision flow plus notification integration checks in isolated PostgreSQL/PGlite.
   - `npm test -- --watchAll=false --runInBand --silent src/pages/dashboard/Notifications.test.js src/pages/StudentDashboard.workspace.test.js src/pages/TeacherDashboard.workspace.test.js src/pages/StudentDashboard.submission.test.js`: 4 suites, 52 tests PASS (run with `CI=true`).
   - `npm run build`: PASS with existing lint warnings in App, Dashboard, Startup, StudentDashboard, and TeacherDashboard. No notification-component lint warnings remain.
   - `node scripts/test-notification-layout.cjs`: PASS at 1280/600/360px using installed Edge, actual React-rendered markup, and built CSS. This uses inert data, not a live signed-in Supabase session.
   - `git diff --check`: PASS.

22. **Deployment steps**:
   1. In the target Supabase project's SQL editor, apply `in_app_notifications.sql` as the database owner, after the existing submission security, processing, provenance, student-resubmission, and revision migrations. For an up-to-date WriteCheck database, only this new SQL file is required. Do not rerun the legacy base schema as a substitute.
   2. Deploy the frontend using the normal `npm run build` workflow. No new dependency, environment variable, SMTP setting, FastAPI endpoint, or realtime publication is required.
   3. Use an enrolled student and classroom teacher to confirm a new assignment, submission, revision request/completion, and explicit grade return appear in the appropriate accounts. Confirm a second unrelated student sees none.
   4. Notifications start with events after migration; historical assignments/submissions are not backfilled. Before the migration is applied, notification requests show a local error while the rest of the dashboard remains usable.

Live Supabase migration application and signed-in production smoke tests remain deployment steps; they were not performed by this implementation.
