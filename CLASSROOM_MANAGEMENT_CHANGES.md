# Classroom management update

## Files changed
- `src/pages/TeacherDashboard.js`: capture classroom context for creation; remove the classroom selector and implicit first-classroom fallback; keep the classroom fixed when editing assignment details; request fresh, scoped Excel exports; refresh dashboard membership data after removal.
- `src/pages/dashboard/ClassroomDetail.js`: reuse the classroom header for Export Excel and pass removal capability to the People view.
- `src/pages/dashboard/ClassroomRoster.js`: owner workspace removal action, named confirmation, pending/error states, immediate removal and roster reload.
- `src/pages/dashboard/gradeExport.js`: Subject, Assignment, Student Name, Grade as the first four columns; preserve supplementary export columns and notes.
- `src/pages/dashboard/{ClassroomDetail,ClassroomRoster,gradeExport}.test.js`: export context, removal/cancellation/student view, and actual XLSX header/value checks.
- `classroom_management.sql`: separate database migration.
- `scripts/test_classroom_management.cjs`: executable isolated PostgreSQL authorization and data-integrity regression checks.

## Backend and database
Apply `classroom_management.sql` separately in Supabase SQL Editor after the existing `supabase_schema.sql`, `admin_schema.sql`, and `submission_security.sql` migrations. It was not applied to the live database. Deploy it before the frontend update.

No tables, columns, account records, or authentication flows are changed. The migration adds two authenticated Supabase RPCs:
- `remove_classroom_student(requested_classroom_id, requested_student_id)`: validates the active classroom owner or authorized admin and deletes only the matching membership. Existing submissions and grades remain.
- `export_classroom_grades(requested_classroom_id)`: validates the active owner/admin and joins the selected classroom, its assignments, students, and latest matching submissions. Returns authoritative full names, assignment titles, subject, and recorded grades. Historical grades of removed members remain exportable. Missing submissions/grades have blank grades, preserving the existing export behavior.

A restrictive assignment SELECT policy enforces actual enrollment/ownership even alongside older permissive policies. A legitimate teacher INSERT policy works with existing restrictive ownership checks. The assignment identity trigger prevents moving assignments to another classroom.

Existing API submission authorization already validates assignment/classroom relationships in `submission_security.sql`; those checks remain in effect. No FastAPI endpoint changes are needed.

## Classroom enforcement
The classroom workspace captures `openedClassroomId` into creation state; the form has no classroom selector and submission requires that exact active classroom. The global Create action uses the selected classwork context or returns to the classroom list when none is selected. It never silently picks the first classroom.

Assignment INSERTs are validated by database ownership policies. Student assignment queries already use enrollment classroom IDs, and the new restrictive database policy independently denies non-enrolled access. Export SQL constrains both assignment and submission classroom IDs, and removal constrains both classroom and student IDs. Excel export requires a single classroom (or an assignment identifying one), including when entered from Grades & Submissions.

## Automated validation
- Full React/Jest suite: 23 suites, 102 tests passed. Final targeted rerun: 3 suites, 13 tests passed.
- Normal production build (`CI=false npm run build`) succeeds with existing lint warnings.
- Strict CI build fails on existing lint warnings (unused imports, duplicate object key, and hook dependencies); unrelated warning cleanup is outside this change.
- Isolated PostgreSQL/PGlite checks execute the actual new migration and existing authorization functions against an ephemeral fixture database: creation in A, rejection of creation in another teacher's B, A-only export, denied foreign exports/removal, enrolled visibility, non-enrolled invisibility, removal preserving the account and B membership, retained submissions, lost assignment access after removal, and authorized admin removal.
- XLSX serialization/deserialization checks confirm headers and recorded numeric grades, including zero and missing grades.
- Tests use fixtures/mocks and do not modify live accounts. Live browser/Supabase acceptance testing remains a deployment check.

To rerun database checks, install `@electric-sql/pglite` outside the app and run `node scripts/test_classroom_management.cjs <absolute-path-to-pglite-package>`. It is not an application dependency.

## Manual acceptance tests
1. Prepare Classroom A and B, with a student enrolled in both, plus another student enrolled only in B. Record memberships and account IDs.
2. In A > People, click Remove Student. Cancel once and confirm the student remains. Repeat and confirm removal. The list and count should refresh; the account, B membership, and previous submissions must remain. A different teacher/student calling the removal RPC must receive an authorization error.
3. In A > Homework, create an assignment with a distinctive title and due date. Confirm there is no classroom selector. Inspect `assignmentTable.classroom_id`: it must equal A. Verify the assignment appears in A and not B. Try a direct insert into another teacher's classroom: it must be denied.
4. Sign in as an enrolled A student and refresh: the assignment must appear. Sign in as the B-only student: neither the UI nor a direct Supabase assignment query should return A's assignment. A removed student must also lose access to A's assignments.
5. Record different grades in A and B. From A click Export Excel. Open the workbook and check the first four headers: Subject, Assignment, Student Name, Grade. Verify A's subject, exact assignment titles, full student names, and saved grades, with one row per student/assignment. No B-only assignments/students may appear. Also test zero, missing grades, and multiple submission attempts (latest wins).
6. From Grades & Submissions, select A and export. Repeat with B. With all classrooms selected and no specific assignment, export should ask for a single classroom rather than combine classrooms.
