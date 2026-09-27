# Implementation completion report ? 2026-09-27

Status: local implementation and automated validation complete for manual report
integrity, release verification and unknown routes. Production rollout and live
acceptance remain pending. The user's confirmation that the live HTTPS deployment
receives plagiarism-checker results is retained; no production outage is inferred.

## Changes completed

| Area | Implemented behavior | Main files |
| --- | --- | --- |
| Manual API submission | Provider submission failures return HTTP 502 instead of creating a successful local report. Manual requests use real, non-sandbox scans. | `backend/main.py` |
| Manual completion | Polling reads status without generating results after three seconds. Authenticated completion callbacks validate the provider score. Invalid completion payloads fail explicitly. The simulation endpoint returns HTTP 410. | `backend/main.py`, `backend/copyleaks_service.py` |
| Historical manual reports | Completed records without the new provider provenance marker are presented as failed/unverified and need a new scan. History reads use the same check. Existing stored records are not rewritten. | `backend/main.py` |
| Provider scores and sources | Removed replacement searches, invented fallback URLs, Wikipedia exclusions, source truncation and local score substitution. Empty matches and genuine zero scores are valid. Internet, database and repository matches are retained; missing URLs remain missing. SQLite no longer rounds stored provider scores. | `backend/copyleaks_service.py`, `backend/submission_checker.py`, `backend/plagiarism_db.py`, `src/pages/TeacherDashboard.js` |
| Saving a manual report | The legacy save endpoint obtains score/sources from the owner's completed server scan and checks the submitted text. Client-supplied scores are not trusted. Submission release still requires its durable processing job when a report exists. | `backend/main.py` |
| Manual frontend | API errors propagate to the error UI. Pending responses at the polling deadline produce a timeout instead of a completed local estimate. The report display keeps provider scores and Wikipedia sources. | `src/pages/TeacherDashboard.js`, `src/pages/dashboard/plagiarismScan.js` |
| Teacher verification | Classroom-only mode must come from the server job checkpoint, not a client/stored report claiming that mode. Automatic callback verification remains in place. | `backend/submission_status.py` |
| Release integrity | New repeatable migration checks ready state, provider error absence, successful callback status, expected job scan ID, report provider/mode, and valid matching provider/report/stored scores. Explicit classroom-only jobs remain supported. Legacy grade-only records without jobs or scan reports retain their existing release behavior. | `submission_provenance.sql` |
| Student reads | The migration hides grade, feedback, text and return timestamp when a returned report no longer verifies. Direct student table access is also guarded by RLS. The existing RPC continues to hide plagiarism reports/scores from students. | `submission_provenance.sql` |
| Unknown URLs | Catch-all page explains that the page is missing and offers a home link. | `src/App.js` |
| Audit/setup documentation | Updated current status, corrected historical findings and documented the migration order. | `SYSTEM_FUNCTIONALITY_AUDIT.md`, `WORKFLOW_SETUP.md` |

## Validation completed

- Backend: **96 tests passed**, using `python -m unittest discover -s backend -p 'test_*.py'`.
- Frontend: **87 tests passed across 20 suites**, using `npm test -- --watchAll=false --runInBand` with `CI=true`.
- Disposable PostgreSQL/PGlite integration checks passed. The new migration was
  applied twice. Checks cover legacy-ready reports, absent/mismatched/failed
  callbacks, invalid scores, valid release, student RPC/RLS restrictions after a
  later provider error, and explicit classroom-only release. Existing queue,
  lease, authorization and privacy checks also passed.
- Production build succeeded with existing unused-import/variable, hook-dependency
  and duplicate-key warnings. The frontend suite also emits an existing avatar
  test-mock warning; backend emits an existing Starlette/httpx deprecation warning.
- `git diff --check` passed.

New backend tests execute the actual manual endpoint bodies without loading OCR
models. Provider and database calls in those unit tests are mocked; the SQL checks
use a disposable representative schema. These checks do not prove deployed schema,
real provider delivery or browser acceptance.

The disposable database fixture was updated with the storage bucket `name` column
required by the current schema. No production authorization rule was weakened.

## Production rollout still needed

1. Deploy the updated backend and frontend together, including all queue workers.
2. Apply `submission_provenance.sql` after the existing security, release and
   processing migrations. Apply it last again if those older migrations are rerun.
   This migration has **not** been applied to the shared/live database.
3. Recheck legacy submissions that fail verification. A ready flag alone no longer
   permits release. If the teacher view reconstructs a valid callback report but
   the stored score/identity is stale, reprocess it before return. No automatic
   rewrite of historical grades or reports was performed.
4. Keep the working public HTTPS callback configuration. Manual callbacks must
   reach the backend with the same persistent manual scan database; automatic
   submissions continue using the durable Supabase job callback path.

## Live verification/configuration still outstanding

The HTTPS application URL, intended test classroom/assignment and teacher/student
sessions were requested. No live paid scan, submission, grade release, deployment
or production migration was performed during this implementation.

Once test access is available, verify one scan's job ID, authenticated callback,
provider score and sources against the teacher report; save a grade, return it,
confirm visibility for the correct student and privacy for another account.
Also exercise provider failure and delayed completion without local fallback.

SMTP is still unconfigured/disabled; actual submission-email and weekly-digest
delivery requires SMTP configuration and an intended test recipient. Existing
notification code was not replaced and no email was sent. Mixed-content PDF,
representative handwriting, TXT/DOCX/image and cross-device profile/browser
acceptance remain outstanding; existing automated extraction/settings tests pass.

Optional classroom deletion/member removal, assignment lifecycle changes,
resubmission and bulk return/export expansion were not added; they remain scope
decisions rather than part of these integrity fixes.


## Follow-up ? 2026-09-28: homepage and failed student resubmission

Removed the homepage **Transcribe handwriting** link; the local test route remains.
Added **Resubmit failed work** in the student submission list. Students can replace
failed ungraded work using the existing upload/transcription/review form. The backend
uses a service-only atomic RPC to replace the same submission and queue a new check.
It rejects another student's work, non-failed/stale jobs, saved grades (including
zero and unreleased grades), returned work, inactive/non-enrolled students, archived
classrooms and closed deadlines. Lost-response retries never treat the old existing
submission as confirmation that replacement succeeded. Old uploaded files remain.

The user reports having applied `submission_provenance.sql` in Supabase. This feature
requires an additional migration: **`student_resubmission.sql`**, applied after it.
The additional migration has not been applied live by this agent. Backend/frontend
deployment and live test-account acceptance remain required.


Follow-up validation: **98 backend tests** and **90 frontend tests across 21 suites**
passed. Disposable PostgreSQL checks passed with the new migration applied twice,
including ownership, stale requests, duplicate retries, atomic replacement, saved
zero-grade rejection, archive restrictions and closed deadlines. Production build
passed with existing warnings. No paid scans or live student records were changed.
