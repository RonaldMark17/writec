# System functionality audit — 2026-09-27

Scope: local source review and automated checks across authentication, profiles,
student/teacher/admin workspaces, classrooms, assignments, document extraction,
submission processing, plagiarism reports, grading, and result release. This is
not a completed browser acceptance test with live accounts. No deployment or
shared database migration was performed.

## Implementation status after follow-up

The manual fallback/source-replacement paths have been removed in local backend and
frontend code. Manual failures and polling timeouts now remain errors; authenticated
callbacks supply completed reports. The unknown-route page is implemented.
`submission_provenance.sql` adds release and student-read verification, with explicit
classroom-only support; the migration is tested locally but not applied to production.
See `IMPLEMENTATION_COMPLETION_REPORT.md` for changes, validation and remaining live
acceptance/configuration work. The follow-up review below records the findings that
led to these changes, not the current implementation status.

## Follow-up review incorporating live HTTPS results

The user confirms that the live HTTPS server receives plagiarism-checker API
results. This review accepts that operational observation; it did not independently
inspect production callbacks or run a paid scan. The earlier zero-credit observation
is historical, not evidence of the current production balance or an API outage.
Local worker isolation is a development-test concern, not a prerequisite for the
already working live HTTPS integration.

The automatic workflow in `backend/submission_checker.py` requires a successful
provider payload with the expected scan ID and a valid aggregate score. The separate
manual endpoints in `backend/main.py` still contain fallback completion and source
replacement logic. Those branches have no localhost-only guard, so HTTPS alone does
not prevent them from affecting manual reports. Preserve the working callback path
while removing fabricated completion and preserving provider scores and sources.

Next actionable work:

1. Make manual submission errors explicit and keep pending scans pending until a
   verified provider result arrives; do not replace empty or Wikipedia matches with
   locally found sources. Add regression coverage for delayed and failed scans.
2. Strengthen database return guards to require verified provider provenance for
   Copyleaks-mode jobs, preserving explicit classroom-only checks. Test legacy-ready,
   missing/mismatched callbacks and valid callbacks before applying the migration.
3. Verify a live returned assignment end to end using the working HTTPS deployment:
   match the job scan ID, callback score/sources and teacher report, then confirm
   grade/feedback release to the correct student. This review did not perform it.
4. Add a useful unknown-route page. Finish SMTP delivery and representative mixed
   PDF/browser acceptance checks described in `MEDIUM_PRIORITY_SETUP.md`.

Follow-up validation: 16 focused checker/status unit tests passed
(`python -m unittest test_submission_checker test_submission_status`, from `backend`).
These tests use mocks and do not establish current live API behavior. This follow-up
changes documentation only; no deployment or database migration was performed.

## Medium-priority implementation update

The medium findings below describe the original audit. They have now been
addressed in local code: automatic-check settings are consumed, preferences save
to Auth metadata across devices, service badges load real status, mixed-content
PDFs OCR embedded images alongside text, and an opt-in SMTP notification worker
provides submission emails and weekly count digests with persistent receipts.
SMTP remains unconfigured and disabled; live delivery is not verified. Complex
PDF layout reconstruction is still limited. See `MEDIUM_PRIORITY_SETUP.md` for
behavior, configuration and limitations. Critical/high follow-up implementation status is recorded above; production rollout remains pending.
Validation after these changes: 83 backend tests and 74 frontend tests passed;
production build succeeded with existing warnings. A read-only live lookup
confirmed the backend can retrieve the assignment teacher's preferences.

## Original findings and follow-up status

| Priority | Area | Finding and consequence | Evidence |
| --- | --- | --- | --- |
| Critical ? fixed locally | Manual plagiarism checking | Removed fabricated completion, frontend error fallback, parser/source replacement and Wikipedia filtering. Unverified historical manual reports require a new scan. Deployment pending. | `backend/main.py`: `check_plagiarism`, `get_plagiarism_scan`, and `save_submission_scan_endpoint` |
| High ? migration prepared | Report release integrity | Added `submission_provenance.sql`: validates durable job, callback identity, successful status and matching valid score before return; hides unverified returned results at RPC/RLS student-read boundaries. Explicit classroom-only mode remains supported. Production migration pending. | `submission_provenance.sql`, `backend/submission_status.py` |
| Verification | Local API acceptance testing | User confirms live HTTPS API results work. The earlier zero-credit observation is historical. Shared local/deployed queue handling still needs isolation for independent local acceptance; it does not establish a production failure. | `WORKFLOW_SETUP.md`, previous read-only API/queue inspection; credentials omitted |
| Medium ? implemented locally | Detection settings | Automatic processing consumes sensitivity and peer-check preferences; live behavior acceptance remains. | `src/pages/dashboard/ProfileEditor.js`; repository-wide reference search |
| Medium ? configuration pending | Notifications | Opt-in SMTP worker and persistent receipts exist; SMTP delivery remains unconfigured and unverified. | `src/pages/dashboard/ProfileEditor.js`; repository-wide reference search |
| Medium ? implemented locally | Service status | Badges now query real readiness; production acceptance remains. | `src/pages/dashboard/ProfileEditor.js` |
| Medium ? implemented locally | Profile persistence | Preferences and profile details persist through Auth metadata; cross-device browser acceptance remains. | `src/pages/dashboard/ProfileEditor.js`: `save`; `src/pages/Dashboard.js` |
| Medium ? partially verified | PDF coverage | Mixed-content extraction now OCRs embedded images alongside text. Complex layouts and representative handwriting still need acceptance testing. | `backend/document_text.py`: `extract_document` |
| Low ? fixed locally | Unknown routes | Catch-all page explains the missing route and links home. Deployment pending. | `src/App.js` |

## Features absent from the current user interface

These are scope decisions, not necessarily defects in the agreed workflow:

- Student replacement after failed processing is implemented locally (`student_resubmission.sql`); graded, returned, pending and ready work remain locked. Production rollout is pending.
- Teacher classroom deletion and member removal. Archive/restore and student leave-class controls already exist; live acceptance remains to be verified.
- Assignment deletion/archiving.
- Bulk return actions and broader report export. Archived-class CSV export already exists in `TeacherDashboard.js` (`handleExportClassroomCSV`).

Evidence: action handlers and controls in `StudentDashboard.js`,
`TeacherDashboard.js`, `ClassroomDetail.js`, `ClassroomRoster.js`, and
`AdminDashboard.js`. Administrative class access is observational.

## Implemented areas reviewed

| Area | Existing behavior | Remaining verification |
| --- | --- | --- |
| Authentication | Registration, duplicate handling, role routing, expiration/logout, inactive-account blocking, password reset | Actual confirmation/recovery email delivery and cross-account browser acceptance |
| Administration | Counts, searchable/paginated users/classes/logs, account disable/reactivate, details | Live admin-to-student deactivation acceptance |
| Classrooms/assignments | Teacher creates classes/assignments and edits assignments; students join by code; rosters and deadlines | Live multi-user scenario and missing lifecycle controls above |
| Student submission | Transcription preview/correction, original upload, atomic saved text/file reference, duplicate-safe submission | Real TXT/DOCX/PDF/image acceptance matrix and browser interruption |
| OCR | YOLO–TrOCR image processing, streamed progress, retries, local preview | Representative handwriting accuracy; CPU latency remains minutes for some pages |
| Automatic checking | Durable queue, leases, checkpoints, retry/correction, verified teacher status | Credits, isolated worker/callback path, release integrity above |
| Teacher review | Original document/text, report sources, grade/feedback draft, return, correction/recheck | Full live workflow through student-visible returned results |
| Privacy | Authorized file access, private results until return, role restrictions | Local database tests cover representative schema, not proof of deployed migrations |

## Audit changes and checks

- Fixed outdated admin-route test mocks to support Supabase `abortSignal`; no production authorization logic was relaxed.
- Full Python suite: 71 tests passed.
- Full React suite: 70 tests passed across 18 suites after that mock correction.
- Disposable PostgreSQL integration checks passed: RPCs, RLS, private results, return controls, atomic queueing, duplicate retries, lease recovery, stale-worker rejection, and repeat migrations. PGlite was installed outside the repository in a temporary directory.
- Production build passed with existing unused-variable and hook-dependency warnings. This does not establish live account or API acceptance.

## Remaining rollout and acceptance work

1. Deploy the reviewed backend/frontend and apply `submission_provenance.sql` last.
2. Verify a test assignment through the working live HTTPS provider callback, teacher
   review and release to the correct student; confirm cross-account isolation.
3. Configure SMTP for an intended test recipient and verify opt-in delivery/digests.
4. Run representative PDF/image/DOCX/TXT and cross-device profile acceptance checks.
5. Choose whether to add the remaining optional lifecycle and bulk-action features.
