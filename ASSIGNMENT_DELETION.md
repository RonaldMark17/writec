# Assignment deletion

## Deployment

Apply `assignment_deletion.sql` in the Supabase SQL Editor as the database owner,
after the existing submission security/processing/revision/evidence, assignment
comment/visibility, and notification migrations. Deploy the frontend afterward.
The feature fails closed if either RPC is missing. This change does not apply the
migration to a live project or delete any live assignment.

There is no existing Trash field or restore workflow, so this implements permanent
database deletion with strict confirmation instead of introducing soft deletion.
The migration adds two RPCs and, only if absent, a validated submission-to-assignment
foreign key. Existing orphaned submissions cause migration validation to fail;
they are never silently deleted or repaired.

## Authorization and transaction

The browser calls Supabase using its existing authenticated session. PostgreSQL
uses `auth.uid()` and `can_manage_classroom`, which checks an active teacher account
and classroom ownership. Both RPCs additionally require the exact assignment ID,
classroom ID, and assignment teacher ID to agree. Missing/inaccessible assignments
raise SQLSTATE `42501` (PostgREST authorization failure/403 for signed-in callers).
Anonymous RPC execution is revoked. The existing restrictive policy forbidding
direct assignment table DELETE remains in place.

The final RPC rechecks the current, case-sensitive title (trimming only the typed
value's outer spaces) and requires acknowledgement to be `true`. It locks the
classroom, assignment, submissions and jobs. Pending/processing jobs block deletion.
All database deletes execute in one transaction; an error rolls them all back.
The FK prevents concurrent submission insertion from leaving orphaned work.

Repository migrations define the comments and evidence cascades, but do not contain
the original base-table DDL or a live schema snapshot. Consequently, the RPC checks
the deployment's actual foreign keys before deleting. Only explicitly reviewed
assignment→submission/comment, submission→job/revision/legacy-grade and job→evidence
relationships are accepted. Additional incoming relationships fail closed and need
review before enabling deletion. No broad classroom-scoped deletion is performed.

## Data scope

| Record | Handling |
| --- | --- |
| `assignmentTable` | Delete only the confirmed ID, classroom and owner. |
| `submissionTable` | Delete only rows with that exact `assignment_id`; includes saved grades, feedback, OCR text, similarity and peer reports. |
| `assignment_comments` | Delete private and class comments for that exact assignment. |
| `notifications` | Delete notifications with that exact assignment ID. |
| `submission_jobs` | Delete jobs for the submission IDs selected from that exact assignment. |
| `submission_match_evidence` | Delete artifacts for those jobs (also protected by the existing cascade). |
| `submission_revisions` | Delete revision requests, snapshots and replacement references for those submission IDs. |
| Supabase `submission_grades` | Delete historical cloud grade copies for those submission IDs. |
| Classroom, enrollment, profiles, other assignments and their children | Unchanged. |
| Private Supabase Storage objects, local uploaded files and revision files | Retained; no Storage metadata or filesystem deletion. Existing access checks remain in effect; existing signed URLs may remain valid until expiry. |
| Standalone `plagiarism_scans`, external provider history, legacy local SQLite records | Retained; these are outside the PostgreSQL transaction and lack a reliable exclusive assignment ownership relationship. No filename-based or scan-ID inference is used to delete them. |

Assignment creation/editing has no separate attachment store in the inspected code.
Unknown additional dependent tables are not guessed at or automatically purged.
This is assignment deletion, not a guarantee that all historical copies are erased.

## UI safety

Deletion is available only under **More actions** in teacher assignment details,
not the embedded Grades view, Scan Station or student workspace. Opening the modal
only fetches a verified preview. Cancel has initial focus; exact title plus checkbox
enables the final button. Enter is blocked, outside clicks do nothing, Escape cancels
unless deletion is running, and a synchronous in-flight guard prevents duplicate
requests. Failure keeps the assignment and dialog; network ambiguity is not falsely
described as “no changes made.” Success refreshes Classwork and clears stale selections.

## Verification

- `node scripts/test-assignment-deletion.cjs` — isolated PostgreSQL authorization,
  confirmation, scope, FK, rollback and sibling/classroom preservation tests.
- `npm test -- --watchAll=false --runInBand --runTestsByPath src/pages/dashboard/DeleteAssignmentDialog.test.js src/pages/TeacherDashboard.workspace.test.js`
- `npm run build`
