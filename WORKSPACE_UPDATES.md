# Workspace, comments, and submitted-work update

## Files changed for this request

| File | Change |
| --- | --- |
| `src/pages/TeacherDashboard.js` | Retains classroom navigation context in Classwork/Grades, hides an empty archive menu, shows assignment comments. |
| `src/pages/StudentDashboard.js` | Loads submissions before statuses, retains submitted assignment selection, displays saved work, adds comments and completed assignments, hides an empty archive menu. |
| `src/pages/dashboard/ClassroomDetail.js` | Displays Turned In on submitted classroom homework. |
| `src/pages/dashboard/ProfileEditor.js` | Hides AI & Preferences for students; teacher/admin controls remain. |
| `src/pages/dashboard/shared.js` | Consistent Turned In and Assigned status labels. |
| `src/pages/dashboard/useClassroomArchiveSync.js` | Shared realtime archive updates, focus/storage reconciliation, and 30-second fallback polling. |
| `src/pages/dashboard/AssignmentComments.js` | Shared student/teacher comment list, student posting form, loading/error/retry handling. |
| `backend/main.py` | Existing archive endpoint now queries with the caller's session and account-scoped SQL. |
| `assignment_comments.sql` | Exact separate migration for comment storage, checked RPCs, account-scoped archived records, and classroom realtime publication. |
| `src/pages/StudentDashboard.workspace.test.js` | Saved-work reopening/remount, loading state, status transition, archive visibility, and foreign-submission exclusion. |
| `src/pages/TeacherDashboard.workspace.test.js` | Classroom context/filter switching and final archive restore. |
| `src/pages/dashboard/AssignmentComments.test.js` | Posting, teacher viewing, and assignment switching. |
| `src/pages/dashboard/ProfileEditor.test.js`, `assignments.test.js` | Student profile visibility and status labels. |
| `backend/test_classroom_archive_api.py` | Caller-session archive API tests without starting OCR workers. |
| `scripts/test_workspace_updates.cjs` | Isolated PostgreSQL tests of the actual migration and authorization functions. |

Previous classroom removal, assignment creation, and Excel-export work remains intact; its separate migration/report is unchanged.

## Frontend behavior and classroom context

`openedClassroomId` remains the teacher's current classroom context. Header navigation to Classwork or Grades sets that page's classroom filter to this ID, clears an incompatible assignment selection, and leaves the classroom selector available. Selecting another classroom updates both the filter and navigation context. Selecting all classrooms or clearing Grades filters clears the context. Existing ownership-checked Supabase/API queries and the prior assignment RLS migration continue to enforce server permissions; frontend selection narrows only the already authorized data.

Archive buttons render only when `archivedClassrooms.length > 0`, computed from the account's loaded classroom records. A successful final restore switches back to Active classes. The shared subscription updates archive state immediately on a database event; polling/focus refresh reconciles connections when realtime is unavailable. Browser archive caches no longer determine visibility when authoritative records are missing. Student assignment archive state is derived from the current classroom records too.

The student Profile & Info and Security settings remain available. Only the student AI & Preferences tab/content is hidden.

## Comments and backend/API changes

No suitable comment table existed. `assignment_comments` stores UUID `id`, `assignment_id`, `classroom_id`, `student_id`, `comment_text`, and server-generated `created_at`, with foreign keys, a scope index, and a 1-2000 character check.

- `post_assignment_comment(assignment, classroom, text)` validates current enrollment, authoritative student role, and the assignment/classroom pair. The database supplies `student_id = auth.uid()`; the client cannot impersonate another student or choose the timestamp.
- `list_assignment_comments(assignment, classroom)` checks the same assignment/classroom access, joins the existing profile for the full name, and returns comments in posting order. Students see their own comments; the classroom owner sees all its student comments.
- Table RLS is enabled and direct browser table privileges are revoked. Access is through the authenticated RPCs. A trigger rejects mismatched assignment/classroom pairs even for privileged table writes.
- Existing `GET /api/classrooms/archived` keeps its route and success response shape, but calls `list_my_archived_classrooms()` using the caller token. It no longer uses a service-role query to return every account's archived classroom IDs.

No additional FastAPI comment routes or alternative submission storage were introduced.

## Turned In and previous submissions

The existing `list_submission_results` RPC loads saved submissions; its database authorization already restricts students to their own records and teachers to their classrooms. The student loader additionally validates the current student, assignment, and classroom IDs. Normalized rows now retain `studentId`, and assignment status derives from the newest matching normalized submission, including background updates from `useSubmissionProgress`.

A submission wins over the due date: submitted work shows Turned In; without a submission, past deadlines show Overdue and future/no-deadline work shows Assigned/Due soon. Completed assignments remain selectable. The selected assignment is not cleared merely because it has been submitted.

Opening completed work renders the saved title, timestamp, existing `SubmissionFilePreview`, available extracted text, and released grade/feedback. The existing detailed submission viewer remains available. Grade-release and plagiarism-result privacy rules remain unchanged. Loading or failed status queries do not render a false No work due state, and students do not need to upload again to view saved work.

## Migration and deployment

Apply `assignment_comments.sql` in Supabase SQL Editor after the existing security migrations and `classroom_management.sql`, before deploying the updated backend/frontend. It also adds `classroomTable` to the existing `supabase_realtime` publication if needed. It does not alter existing academic table columns or authentication.

The migration has been executed only against an isolated fixture PostgreSQL database, not the live Supabase project. No live accounts or classrooms were modified.

## Validation

- Full frontend suite: 26 suites / 111 tests passed, followed by a passing 5-test student-workspace rerun for the final student-status change.
- Production build succeeds with existing lint warnings (unused imports/variables, an existing duplicate key, and existing hook dependencies).
- Archive API: 3 Python tests passed. Existing submission-access regression suite: 7 Python tests passed. `backend/main.py` passes Python compilation.
- Isolated PostgreSQL: comment posting/name retrieval, assignment and classroom isolation, teacher access, student privacy, non-enrolled/removed-student rejection, spoof-resistant direct access, submission privacy, archive account scope, and final restore all passed.
- SQL harness command: `node scripts/test_workspace_updates.cjs <path-to-@electric-sql/pglite>`. The package is installed outside the application; no application dependencies changed.

These are automated component/API/database checks. A live authenticated browser acceptance run was not performed; the live migration has not been applied. Use the following acceptance checklist after deployment.

## Manual acceptance checklist (all 19 requested cases)

Prepare two teachers, Classroom A owned by teacher A, Classroom B owned by teacher B, one student enrolled in A, another enrolled only in B, and one additional student enrolled in A for the submission-privacy check.

1. For both teacher/student accounts with zero archived classrooms, verify Archived classes is absent.
2. Archive an enrolled/owned classroom and verify the menu appears for the relevant accounts.
3. Restore the final archived classroom and verify the menu disappears, Active classes opens, and the restored assignments are available. Keep another student browser open to check realtime delivery.
4. Open A as its teacher, then click Classwork; verify A is selected.
5. Select another owned classroom from the Classwork filter; verify only that classroom's assignments appear.
6. Open A, then click Grades; verify A is selected.
7. Change the Grades classroom filter; verify its assignment choices, rows, and subsequent Classwork navigation use the new classroom.
8. Open the student profile: AI & Preferences is absent, Profile & Info and Security remain. Verify the teacher preference tab still works.
9. As the A student, open Assignment A, post a comment, and verify full name, text, and timestamp. Refresh and verify persistence.
10. Open Assignment A as teacher A and verify that comment appears.
11. Open another assignment in A, and an assignment in B; neither should contain Assignment A's comment.
12. As a B-only student, call the comment RPC for A or query A's assignments; access must be denied/no rows. Also test a mismatched assignment/classroom pair.
13. Open an unsubmitted assignment; normal submission controls must appear.
14. Turn it in and verify Turned In (processing progress may also be displayed).
15. Return to the assignment list; verify it appears under Turned In.
16. Reopen it; verify original file/content, timestamp, and any released grade/feedback, without another upload.
17. Refresh the browser and reopen it; verify the database-backed work is still displayed.
18. Throttle the network and reopen the page; verify Loading submission appears instead of a temporary No work due or empty work state.
19. Sign in as the other A student; verify their assignment has their own state and cannot show the first student's submission/file. Repeat with direct submission/file API requests to confirm backend denial.
