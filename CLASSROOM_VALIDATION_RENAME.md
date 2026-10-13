# Classroom validation and rename implementation

Implemented in the existing React/FastAPI/Supabase application. Production deployment and application of the SQL below are still required. No live classroom was changed during verification.

1. **Files changed for this task.** Shared validation: `src/ValidatedForm.js`, `src/workspace-theme.css`. Forms: `src/pages/{TeacherDashboard,StudentDashboard,AuthModal,AdminDashboard,PasswordReset,Contact}.js`, `src/pages/dashboard/{ProfileEditor,AssignmentComments}.js`. Rename and synchronization: `src/pages/dashboard/{ClassroomDetail,RenameClassroom,useClassroomArchiveSync}.js`, plus both dashboards. Backend: `backend/classroom_settings.py`, `backend/main.py`. Database: `classroom_required_fields.sql`. Tests and browser artifacts are listed below. Earlier Copyleaks/report changes in this working tree are separate from this task.

2. **Forms updated.** Create/copy classroom, create/edit assignment, student join-class and submission title, sign-in/registration, administrator account creation, password recovery/reset, profile, class/private comments, and contact. Existing required fields are validated locally before their submit handlers run. Assignment instructions and the separate optional Subject field remain optional. Student academic profile fields retain their existing required behavior with individual errors; attempting to save from another profile tab reveals the fields needing correction.

3. **Whitespace.** Required checks use trimmed values, so spaces, tabs and line breaks alone fail. Rename trims only the beginning/end before sending. Internal spaces and other entered values are preserved. Inline errors clear/update on change; the first invalid field receives focus. Invalid forms do not invoke their request handlers, and pending submissions are guarded against duplicate clicks.

4. **Backend validation.** The rename Pydantic model rejects missing, null, empty and whitespace-only names with structured HTTP 422 details. Existing registration, profile, comment, contact and submission server/database checks are retained. The new SQL adds required-name/section validation for direct classroom writes and required-title validation for direct assignment writes, returning SQLSTATE 23514 with a message and JSON field detail. A name-only rename can still update a legacy classroom without a section. Existing form server-error displays are retained; the rename dialog shows server validation/access messages and a clear retry message for network/server failures.

5. **Edit location.** The Teacher classroom header actions now include **Edit Classroom Name**, opening a small prefilled dialog. Unchanged names disable Save. Save becomes Saving while pending; Cancel/Escape, keyboard focus containment and focus restoration are supported. Failure keeps the dialog and entered value; success shows “Classroom name updated successfully.”

6. **API.** `PATCH /api/classrooms/{classroom_id}/name` with `{ "name": "New classroom name" }`. It reads the authorized existing record and uses Supabase PostgREST PATCH with a payload containing only `classroom_name`. An unchanged name returns without a database update. No classroom is created and no code is generated.

7. **Authorization.** The existing account middleware verifies an active account. The endpoint requires Teacher role and scopes both read and update to the classroom ID and authenticated owner ID. It uses the caller's JWT, retaining existing classroom row-level security. Students, other Teachers and inactive accounts are denied. Admins retain the current restriction against classroom operations. Hiding the Student action is additional UI behavior, not the access control.

8. **Classroom ID.** Preserved. The update targets the original ID, and isolated PostgreSQL tests compare the complete record before/after.

9. **Class code.** Preserved. Neither the endpoint payload nor UI update changes it; PostgreSQL tests verify it remains `ABC123`.

10. **Related data.** Ownership, archive state, memberships, assignments, submissions and grades are preserved. PostgreSQL tests compare complete related-table snapshots before/after renaming. Existing removal and grade-export regression checks also pass.

11. **UI refresh.** The confirmed response updates Teacher classroom state immediately. Assignment/submission classroom labels follow current classroom state, including review metadata. Shared Supabase Realtime handling now receives names as well as archive state, so an open Student assignment updates without reloading. Existing focus/visibility/storage reconciliation and 30-second polling remain as fallback when Realtime is unavailable. Dashboard cards, class headers, classwork, grades, archived lists, filters and navigation use this current state. Export classroom references use the current name; the separate Subject value is intentionally preserved because this operation updates only the name. Reload reads the persisted database record.

12. **Accessibility and themes.** Errors reuse `.validation-error` and WriteCheck danger tokens, with text, border, `aria-invalid`, `aria-describedby`, and alert semantics. The accessible field label stays stable when its error appears. Headless Edge verified focus, correction, zero invalid requests, and actual computed colors in both themes. Light error text/border is `rgb(166,28,24)` on `rgb(252,232,230)`; dark is `rgb(242,184,181)` on `rgb(68,43,43)`. Screenshots were visually inspected: [light](artifacts/classroom-validation/light.png), [dark](artifacts/classroom-validation/dark.png).

13. **Tests added/updated.** Added `src/ValidatedForm.test.js`, `src/pages/dashboard/RenameClassroom.test.js`, `src/pages/dashboard/useClassroomArchiveSync.test.js`, and `backend/test_classroom_settings.py`. Updated AuthModal, PasswordReset, ProfileEditor, ClassroomDetail, TeacherDashboard.workspace and StudentDashboard.workspace tests. Extended `scripts/test_classroom_management.cjs` with actual RLS policies, field rejection, rename preservation and Student visibility checks. Added `scripts/test-classroom-validation.cjs` for browser verification without live API calls.

14. **Results.** 134 frontend tests passed across 14 relevant suites. All 22 backend rename/account-guard tests passed. Isolated PostgreSQL classroom management/rename checks passed. Edge browser verification passed in both themes. Production build passed with pre-existing lint warnings; `git diff --check` passed. Verification used isolated database fixtures and local components, not a deployed authenticated Teacher/Student session.

15. **Migration and rollout.** Apply [classroom_required_fields.sql](classroom_required_fields.sql) to enforce required fields on existing direct Supabase writes, then deploy the backend and frontend. This adds validation functions/triggers only: no tables, columns, classroom copies, or data backfill. Renaming itself requires no schema change and reuses existing RLS. The SQL has been tested locally but has not been applied to production.

Reproduce backend, database and browser checks:

```powershell
Push-Location backend
python -m unittest test_classroom_settings test_admin_api
Pop-Location
node scripts/test_classroom_management.cjs
npm run build
node scripts/test-classroom-validation.cjs
```

The browser check requires Edge (or `EDGE_BINARY` pointing to a compatible Chromium executable) and the completed production CSS build.
