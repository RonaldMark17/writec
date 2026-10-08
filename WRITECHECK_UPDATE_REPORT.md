WriteCheck update — October 8, 2026

1. **Files changed for this request.**

   | Files | Change |
   | --- | --- |
   | `backend/main.py`, `backend/pipeline.py`, local `backend/.env` | Selected TrOCR path; obsolete fallback paths removed. Existing peer endpoint now uses authoritative saved work. |
   | `backend/classmate_matching.py`, `backend/submission_checker.py`, `backend/plagiarism_db.py` | Scoped peer loading, student names, all relevant matches, existing similarity calculation. |
   | `public/index.html`, `public/manifest.json` | WriteCheck title, description, application names, theme color. |
   | `src/pages/StudentDashboard.js`, `src/pages/TeacherDashboard.js` | Submission-first ordering, paginated lists, current classmate matches in teacher review. |
   | `src/pages/dashboard/Pagination.js`, `ClassmateMatches.js`, `plagiarismScan.js` | Shared pagination, match display, existing API helper updated to propagate failures. |
   | `src/pages/dashboard/ClassroomRoster.js`, `ClassroomDetail.js`, `AssignmentComments.js` | Pagination after classroom/conversation filtering. |
   | `backend/test_classmate_matching.py`, `backend/test_submission_checker.py` | Scope, identity, authoritative-text and worker checks. |
   | `src/pages/dashboard/Pagination.test.js`, `ClassmateMatches.test.js`, `ClassroomRoster.test.js` | Paging, reset, stale-response, error and exact-score checks. |
   | `src/pages/StudentDashboard.workspace.test.js`, `StudentDashboard.submission.test.js` | Saved work and draft forms precede comments. |
   | `README.md`, `OCR_EVALUATION.md`, this report, `backend/ocr_model_verification.json`, `backend/removed_model_files.json` | Setup, verification evidence and model file inventory. |

   Existing unrelated working-tree edits were preserved. No changes were made to the supplied `submission_revisions.sql`.

2. **Old model files removed from the project.** After successful real-model recognition, these directories were moved out of the runtime project:

   - `final_model/`: `config.json`, `generation_config.json`, `merges.txt`, `preprocessor_config.json`, `special_tokens_map.json`, `tokenizer.json`, `tokenizer_config.json`, `vocab.json`.
   - `backend/models/final_model_trocr/final_model/`: those eight filenames plus `model.safetensors` and `training_args.bin`.

   The archive is `C:/Users/crist/writecheck-retired-models/2026-10-08/`, in `root-final_model/` and `backend-final_model/`. These files are **archived, not permanently deleted**. Automatic approval review blocked permanent deletion with “blocked by policy”; the reversible move succeeded. Exact original paths are in `backend/removed_model_files.json`. There are no runtime fallback paths to either retired directory, and the obsolete `TROCR_MODEL_NAME` fallback was removed.

3. **Final model path.** `C:/Users/crist/writec/backend/models/final_model_trocr/BEST_MODEL-TROCR/BEST_MODEL`. The nested `BEST_MODEL` folder contains the checkpoint, processor and tokenizer. Both the backend and standalone pipeline resolve it with the old folders absent. YOLO remains `backend/models/yolo/best.pt`. Restart the backend to load these code/configuration changes.

4. **Website name.** `public/index.html` now has `<title>WriteCheck</title>` and a WriteCheck description. `public/manifest.json` uses WriteCheck for both `name` and `short_name`. A headless Microsoft Edge run against the final production build rendered the application and confirmed `<title>WriteCheck</title>` with no “React App” text in the rendered DOM.

5. **Assignment layout.** Student drafts now appear before Class Comments and Private Comments. Already submitted assignments retain their saved file, date, released grade/feedback and submission details before comments. The teacher assignment roster already precedes comments and retains that ordering. Revision history and existing revision behavior remain available.

6. **Classmate matching.** Reuses the existing phrase-based calculator: 70% four-word phrase containment plus 30% three-word Jaccard overlap, rounded to one decimal. The teacher review lists student names and actual calculated percentages for every match at or above the existing 15% match flag threshold. The previous five-result cap is removed. Opening a review fetches current saved classmates, so a later submission can appear when reviewing earlier work. Internet/Copyleaks results remain separate. Failures are displayed as errors, not fabricated zero scores. Teacher peer-comparison preferences are respected. The current system keeps similarity reports private to teachers, so student access was not broadened.

7. **Scope and privacy.** The endpoint first checks teacher access to the submission and assignment. Request classroom/assignment IDs must agree with the authorized saved submission. Database queries filter both `classroom_id` and `assignment_id`, then returned rows are checked again. Both the current `submission_id` and all records from the current `student_id` are excluded. Names are fetched only for those scoped classmates. Browser-supplied peer text and names are ignored. The existing SQLite fallback lacked classroom/student identity and is no longer used for peer matching. The worker uses the same scoped loader. No additional grades, files or private comments are exposed.

8. **Pagination.** Ten records per page with Previous / Page N of M / Next; controls are hidden for ten or fewer records. Added to classroom rosters/homework, student due-soon/To-do/turned-in assignment lists, student submissions, teacher assignment lists/assignment rosters/scan rosters, grade classroom groups and their assignment lists, class/private comment threads, classmate matches, and internet matched-source lists. Existing admin server pagination is retained. Filtering happens before paging. Classroom, assignment, search, status and private-recipient changes reset the relevant list to page one. Export continues to use the full filtered dataset.

9. **Database changes.** None. Existing submission fields and scan-result JSON hold the calculated metadata. Classmate queries use the existing backend service credentials only after teacher authorization.

10. **SQL migration.** No new migration is required for this update. Existing classroom/submission security and results migrations remain prerequisites; this work does not apply pending migrations to Supabase.

Verification completed:

- Real YOLO + new TrOCR: loaded and warmed successfully, processed four crops, returned nonempty text, and produced identical regular/streamed output. The sample actually has three writing lines, so it exposes an extra detected crop and transcription errors; this does not establish essay recognition accuracy. No Copyleaks credits or cloud submissions were used by this smoke test.
- Six focused backend matching tests passed; 58 submission backend regression tests passed.
- All 39 focused frontend tests passed across nine suites, including submission layout, class switching, pagination, exact match percentages and failed/stale responses.
- Final production build passed. Existing lint warnings remain; strict `CI=true` treats them as errors.
- The broader frontend run had 146 passing tests and three failures in the untouched `PasswordReset.test.js` profile-editing tests. The focused verification above was run after the final feature edits.
- Final build served HTML, JavaScript, CSS, manifest and icons successfully to headless Edge; the browser displayed WriteCheck metadata and rendered the landing page.

Requested acceptance checks:

| Requested tests | Evidence / remaining work |
| --- | --- |
| 1–2: model startup and handwritten upload | Real model loading and upload-handler/stream integration passed on a local handwriting sample. A representative full essay and labeled accuracy check remain to be run. |
| 3: browser name | Passed in headless Edge against the production build. |
| 4–5: new/saved submission before comments | Passed in React DOM integration tests. |
| 6–9: scoped matching and teacher visibility | Passed in backend and React tests using isolated fixtures; authenticated live Supabase acceptance remains. |
| 10–12: page one, next page, classroom reset | Passed in pagination and classroom-roster integration tests; full lists remain scoped before slicing. |

The authenticated manual walkthrough still requires actual teacher/student sessions and a representative handwritten essay. No live grades, comments, submissions or classroom memberships were changed for verification.

Roster sorting and assignment export follow-up — October 8, 2026

- **Files changed:** `src/pages/dashboard/rosterSort.js`, `ClassroomRoster.js`, `gradeExport.js`, `src/pages/TeacherDashboard.js`, their four test files (`rosterSort.test.js`, `ClassroomRoster.test.js`, `gradeExport.test.js`, `TeacherDashboard.workspace.test.js`), and this report.
- **Surname sorting:** students are sorted before pagination with a case-insensitive name comparator. Explicit surname metadata takes precedence when available. The current schema stores full names, so the fallback supports `Surname, Given names`, trailing suffixes such as Jr./III, and common surname particles such as Dela and de la. Equal surnames use the full name and account ID as stable tie-breakers. Displayed names and the separate teacher section are unchanged. Arbitrary multiword surnames cannot always be inferred from a full name alone.
- **Roster refresh:** initial loading and every reload apply the same comparator. Removing a student preserves order and refreshes the roster. Membership realtime notifications also reload the selected classroom; receipt of these notifications depends on the existing Supabase realtime setup.
- **Assignment context:** the assignment detail Export Grades button passes the opened assignment ID explicitly. The Grades & Submissions export button passes its selected assignment/classroom IDs. Classroom-level export passes only the classroom ID, so stale assignment state cannot restrict it.
- **Database verification:** the existing grade export utility now looks up the assignment's database `classroom_id`, rejects a conflicting classroom selection, and verifies assignment membership in that classroom. It calls the existing teacher-authorized `export_classroom_grades` RPC and filters returned rows by verified assignment IDs. Assignment exports contain only that assignment; classroom exports retain all assignments in the selected classroom. The existing workbook builder and download logic remain in use.
- **Warning behavior:** “Open a classroom or select one classroom before exporting grades.” appears only when neither an assignment ID nor a classroom ID is supplied. Deleted/unavailable assignments or mismatched relationships produce specific errors instead of exporting another classroom.
- **Excel columns:** the first four columns remain Subject, Assignment, Student Name, Grade. Existing additional columns, zero scores, blank/ungraded values and workbook formatting are preserved.
- **Database changes:** none; no SQL migration is required.
- **Tests:** all 27 targeted tests in five suites passed, including surname formats, removal and membership reload ordering, assignment 1/assignment 2 isolation, opened assignment export, selected assignment without a classroom filter, classroom-level export, no-context warning, exclusion of foreign classroom records, and Excel workbook round-trip validation. These are automated fixture-based checks, not a live authenticated Supabase walkthrough.
- **Build:** production build passed with the existing unrelated lint warnings.

Grades & Submissions simplification — October 8, 2026

1. **Files changed:** `src/pages/TeacherDashboard.js`, `src/pages/TeacherDashboard.workspace.test.js`, and this report. The existing `gradeExport` utility, workbook layout, authentication and database authorization are reused.
2. **UI simplified:** the Grades page now has one toolbar containing Classroom, Assignment, Reset filters when applicable, Back to Classwork, Edit assignment and Export grades. Removed the overlapping Subject filter, separate Section/Switch row, and the embedded assignment's extra breadcrumb/export/action bar. Duplicate subject labels are suppressed when they match the classroom name. The existing assignment card retains its title, due date, points, posted date, Student work/Instructions tabs, counts, roster and comments. Existing theme-aware styling is retained; no theme styles were changed.
3. **Synchronized context:** the dropdown and assignment cards now use the same selected assignment ID. Opening either immediately sets the classroom from that assignment's database-derived `classroomId`, opens its detail card and resets the student-work filters. Changing classrooms clears the selected assignment and limits available assignments. Entering Grades from an already open assignment preserves that assignment. There is no separate Grades assignment-filter state that can disagree with the viewed assignment.
4. **Assignment export:** the toolbar exports the currently viewed assignment, passing its actual ID and classroom relationship to the existing export utility. That utility re-reads and validates the relationship in the database, invokes the authorized classroom export RPC and keeps only the selected assignment's rows. No visit to Classes is required.
5. **Classroom export:** selecting All assignments clears the detail selection and exports all grades for the selected classroom. Export context priority is the viewed assignment's classroom, the classroom filter, then existing classroom context. The first four workbook columns remain Subject, Assignment, Student Name, Grade.
6. **Warning:** the existing classroom-selection warning is shown only when no assignment, classroom filter or classroom context is available. Reset filters clears all these selections. Invalid assignment relationships still produce a specific error instead of a cross-classroom export.
7. **Database changes:** none; no migration is needed.

Automated coverage includes direct Grades entry, assignment dropdown and card selection, switching between two assignments and their student-work lists, assignment-specific exports, All assignments classroom exports, classroom changes, preservation of an assignment when entering Grades, one selector/action set, no-context warnings, Excel column order and existing theme behavior. Live authenticated acceptance remains a separate manual check.

Validation: all 21 tests across the teacher workspace, grade export, classroom detail and theme suites passed. The final production build passed with the existing unrelated lint warnings. No live classroom data was changed for these checks.


## Peer Similarity inspection popup ? October 8, 2026

- **Workflow:** Grades & Submissions ? select an assignment ? Peer similarity beside a submission ? Inspect beside a classmate. The popup shows both full saved answers, student names, assignment/classroom/subject, submission timestamps/status and the pair's similarity percentage. Back to matches supports inspecting other classmates without leaving the assignment.
- **Evidence:** the existing peer algorithm recalculates the pair from saved text. Server-provided phrases are highlighted only when their consecutive words occur in both answers; original punctuation and text remain intact. Missing or unverifiable evidence leaves full answers visible without highlights. Similarity is described as support for teacher review, not a plagiarism verdict.
- **Scope and privacy:** the backend authorizes the teacher for both submissions, requires the same classroom and assignment, excludes the same submission/student, and verifies saved identities still match authorized records. The response includes only review metadata and answers, with no emails, private comments or unrelated grades.
- **Page preservation and design:** the modal leaves classroom, assignment, roster filters and pagination intact. The match list stays mounted when inspecting a pair, preserving its page. Desktop uses two columns; small screens stack answers. Long answers scroll independently. Existing dark-theme colors are reused. Escape, Close, focus trapping and focus restoration are supported.
- **Files changed for this addition:** `backend/main.py`, `backend/classmate_matching.py`, `backend/test_classmate_matching.py`, `src/pages/TeacherDashboard.js`, `src/pages/TeacherDashboard.workspace.test.js`, `src/pages/dashboard/plagiarismScan.js`, `src/pages/dashboard/ClassmateMatches.js`, new `src/pages/dashboard/PeerSimilarityReview.js` and `PeerSimilarityReview.test.js`, and this report.
- **Validation:** 26 frontend tests passed across peer review, classmate matches, teacher workspace, API helper and theme suites; 9 backend classmate tests passed. Coverage includes two saved answers, exact evidence/fallback, multiple pairs, stale-response handling, match-list pagination, roster-filter/page preservation, teacher authorization and rejection of invalid pair scope. Live authenticated browser acceptance has not been run. No database changes or migrations are needed.
- **Production build:** passed with existing unrelated ESLint warnings.
