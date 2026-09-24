# Private results and Return work

1. In Supabase SQL Editor, run all of `submission_release.sql` as the database
   owner, after the existing `supabase_schema.sql`, `admin_schema.sql`, and
   `submission_security.sql` migrations. Do not recreate the tables.
2. Restart the backend and refresh both workspaces. Deploy the frontend and backend
   together with this migration: older student clients query raw rows and will not
   list private submissions correctly.
3. As the teacher, save a grade and feedback. The review stays open, showing Draft.
   As the student, refresh: the original submission is visible but results are hidden.
4. Click Return work as the teacher. Refresh the student workspace and verify the
   saved grade, feedback and available scan results appear.
5. Edit and save feedback again: results become private until returned again.

All existing submissions start private (returned_at is NULL). Nothing is deleted.
Teachers must return previously graded work if students should see it. Save Grade
and Return work are separate actions; return releases saved values. Grades are
required before return, but running OCR is not required.

Database restrictions block direct student reads of unreleased raw rows and the
legacy grade mirror. The list_submission_results function returns only authorized
metadata and redacts private results. Original file downloads remain available.
No mirror trigger or new secret key is needed.

Local database integration tests cover denied student/other-teacher release,
redaction, release, and making edited results private again. Hosted migration and
real-account acceptance tests remain to be performed by the project owner.
Automatic processing after student upload is the next feature, not part of this change.
