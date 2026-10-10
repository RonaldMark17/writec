# Navigation and Scan Station fixes

Changed `src/pages/TeacherDashboard.js`, `src/pages/StudentDashboard.js`, and their existing `*.workspace.test.js` regression suites. Existing unrelated working-tree edits were preserved.

- Scan Station: removed assignment search, class/section selector, assignment selector, sort selector, roster status tabs, and student/essay search. Removed their unused state, handlers, and filter computations. Clear station, file/text input, OCR, similarity processing, and submission review handlers remain. The station inherits a selected assignment when opened from Classwork/Grades so its linked roster and review actions remain reachable without a filter.
- Teacher Grades: the old header handler preferred the previous assignment, which restored that assignment's classroom even after another classroom had been opened. Classroom cards now use the existing classroom-selection handler to synchronize opened classroom, Grades classroom, and Classwork filter immediately. It clears assignment selection and roster filters. Header navigation also checks classroom ownership before retaining an assignment. Assignments and grade groups derive from the currently selected classroom using the existing loaded data and update subscriptions; no additional API is needed.
- Student Back: assignment opening captures the current dashboard page, opened classroom ID, and selected classroom filter in component state. Back resets the draft and returns to that origin. Classroom origins restore the exact classroom and its Homework view (the tab from which assignments can be opened). To-do, Calendar, and Results origins return to their own pages. Invalid/missing origin falls back to unfiltered To-do. Failed-work resubmission also captures its Results origin.
- No database, environment, backend, or route changes are required. There is no assignment-detail URL in the existing router: assignment details are local dashboard state. Fresh URL entry therefore opens the normal dashboard, without a stale assignment or origin.

## Verification

Regression tests cover repeated A/B classroom switches with an assignment selected, classroom-scoped assignment choices, filter-free Scan Station, exact student classroom A/B return, and To-do return. The existing submission/OCR and submission station suites are also run. These use mocked services, not live YOLO/TrOCR or similarity providers.

Result: all 33 tests passed across five suites (`TeacherDashboard.workspace`, `StudentDashboard.workspace`, `StudentDashboard.submission`, `SubmissionStation`, and `ClassroomDetail`).

Production build passed with the existing lint warnings. A strict `CI=true` build fails because it promotes those warnings (unused variables/imports, an existing duplicate key, and hook dependencies) to errors. No new navigation-related lint warnings were reported. `git diff --check` passed.

Manual acceptance checks still require an authenticated running application:

1. Open Scan Station; verify no filters, upload a file, complete OCR and similarity processing, and clear the station.
2. Open Classroom A and Grades; select Assignment A.
3. Return to Classes, open Classroom B, then Grades; verify B and no selected A assignment.
4. Repeat A → Grades → B → Grades → A → Grades and verify roster data and assignment options.
5. Student: To-do → assignment → Back returns to To-do.
6. Student: Classroom A/B → assignment → Back returns to that exact classroom's Homework view.
7. Open an assignment from Calendar or Results revision/resubmission; Back returns to that source.
8. Open a fresh dashboard URL; confirm normal dashboard entry. Direct assignment URLs are not supported by the existing router.
