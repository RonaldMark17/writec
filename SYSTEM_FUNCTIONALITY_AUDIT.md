# System functionality audit — 2026-09-27

Scope: local source review and automated checks across authentication, profiles,
student/teacher/admin workspaces, classrooms, assignments, document extraction,
submission processing, plagiarism reports, grading, and result release. This is
not a completed browser acceptance test with live accounts. No deployment or
shared database migration was performed.

## Medium-priority implementation update

The medium findings below describe the original audit. They have now been
addressed in local code: automatic-check settings are consumed, preferences save
to Auth metadata across devices, service badges load real status, mixed-content
PDFs OCR embedded images alongside text, and an opt-in SMTP notification worker
provides submission emails and weekly count digests with persistent receipts.
SMTP remains unconfigured and disabled; live delivery is not verified. Complex
PDF layout reconstruction is still limited. See `MEDIUM_PRIORITY_SETUP.md` for
behavior, configuration and limitations. Critical/high findings remain open.
Validation after these changes: 83 backend tests and 74 frontend tests passed;
production build succeeded with existing warnings. A read-only live lookup
confirmed the backend can retrieve the assignment teacher's preferences.

## Confirmed incomplete behavior

| Priority | Area | Finding and consequence | Evidence |
| --- | --- | --- | --- |
| Critical | Manual plagiarism checking | API submission failures create a successful local fallback report; polling fabricates completion after three seconds and can replace real sources/scores. Manual reports cannot currently be trusted as live Copyleaks output. | `backend/main.py`: `check_plagiarism`, `get_plagiarism_scan`, and `save_submission_scan_endpoint` |
| High | Report release integrity | The teacher status endpoint validates provider provenance, but database release guards check job state only. A legacy job marked ready can still qualify for release through the RPC even when the local teacher view rejects its report. Student results use the database result RPC without the teacher endpoint's provenance validation. | `backend/submission_status.py`, `submission_processing.sql`: `guard_processing_review`, `submission_release.sql`: `list_submission_results` and `return_submission` |
| High | Local API acceptance testing | Prior live inspection found zero Copyleaks credits. The local and deployed workers share a queue, and callbacks point to the deployed server. A successful local scan is not yet independently demonstrated. | `WORKFLOW_SETUP.md`, previous read-only API/queue inspection; credentials omitted |
| Medium | Detection settings | Sensitivity and peer cross-check preferences are stored but no processing code consumes them. Changing these controls does not change checks. | `src/pages/dashboard/ProfileEditor.js`; repository-wide reference search |
| Medium | Notifications | Submission-email and weekly-digest controls store preferences only; no sender or scheduler consumes them. | `src/pages/dashboard/ProfileEditor.js`; repository-wide reference search |
| Medium | Service status | Profile badges say Copyleaks is connected and OCR is active without querying service readiness. | `src/pages/dashboard/ProfileEditor.js` |
| Medium | Profile persistence | Institution, department, biography and most preferences are browser-local. They do not reliably follow the account across devices. Name is saved through an RPC; avatar metadata sync is best effort. | `src/pages/dashboard/ProfileEditor.js`: `save`; `src/pages/Dashboard.js` |
| Medium | PDF coverage | OCR runs only when a page has no extracted text. A page containing both selectable text and a handwritten image can silently omit the handwriting. Image-only processing uses embedded images, not a rendered page, so complex layouts need acceptance testing. | `backend/document_text.py`: `extract_document` |
| Low | Unknown routes | There is no catch-all route, so an unrecognized URL renders no useful not-found page. | `src/App.js` |

## Features absent from the current user interface

These are scope decisions, not necessarily defects in the agreed workflow:

- Student replacement/resubmission of already submitted work: explicitly blocked.
- Teacher classroom archiving/deletion and member removal; student leaving a class.
- Assignment deletion/archiving.
- Gradebook/report export or bulk return actions.

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

## Recommended implementation order

1. Remove fabricated manual results and use the same verified provider contract everywhere.
2. Enforce provider provenance at release/result-read boundaries, preserving explicit classroom-only mode.
3. Isolate local queue/callback handling and enable a real credited API acceptance test.
4. Wire up advertised settings/notifications and truthful service status, or clearly mark them unavailable.
5. Address mixed-content PDF extraction and profile persistence.
6. Choose required classroom/submission lifecycle and export features, then run live role-based acceptance.
