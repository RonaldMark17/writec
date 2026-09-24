# Enable submission ownership checks

1. Run the entire `submission_security.sql` in Supabase SQL Editor after the existing
   `supabase_schema.sql` and `admin_schema.sql` migrations. Do not rerun those older
   migrations afterward: deploy security migrations in the documented order.
2. Restart the backend (`npm run start:backend`) and frontend (`npm start`).
3. Test with two students and two teachers, with separate classrooms and assignments.

Students can read their own submitted work and grades. Only the assigned classroom
teacher can save grades/transcriptions/scan results and compare assignment peers.
Personal scan history is bound to the signed-in user, including multipart uploads;
client-supplied user IDs cannot impersonate another user.

File reads require an exact authorized submission reference. Broad filename search,
cross-folder fallbacks, and public download caching were removed from backend file
routes. Local uploads now require an assignment ID and use student/assignment folders
with unique filenames. Unattached legacy local files are deliberately inaccessible;
repair their stored submission file references rather than relaxing the checks.

Database policies also protect direct browser requests, membership changes, assignment
ownership, and cloud storage. Students cannot insert their own grades or modify an
already submitted file. Assignments with submissions cannot change classroom/owner.
Existing signed URLs may remain usable until their expiry; downloaded files cannot
be recalled. Admin monitoring continues through its existing authorized RPCs.

Apply the migration before restarting: the backend now needs `accessible_submissions`
and `can_use_assignment`. The migration has been exercised with representative local
PostgreSQL tables; the hosted database has not been modified by this task.

Copyleaks callbacks now require a per-scan proof in `developerPayload`, following
[Copyleaks webhook security guidance](https://docs.copyleaks.com/concepts/security/webhooks/).
It is derived from `COPYLEAKS_WEBHOOK_SECRET`, or the existing server-only Copyleaks
API key when no separate secret is configured. Old in-flight callback payloads will
be rejected; signed-in owners can still poll their scans. Never expose the secret
in React. The simulation endpoint is disabled unless `ENABLE_SCAN_SIMULATION=1`,
and still requires scan ownership.

Verification:

- Student A cannot read Student B's submission, grade, file or personal scan.
- Teacher A can grade their class but not Teacher B's class, even using a known ID.
- A student cannot call grade/scan-update/peer-check endpoints.
- A forged assignment ID cannot redirect grade updates or upload into another class.
- Direct Supabase reads/updates and storage downloads enforce the same restrictions.
- Traversal and basename-only download attempts fail.
- Admin overview/class inspection still work; administrators cannot grade.

Automated checks:

```powershell
cd backend
python -m unittest test_submission_access test_admin_api -q
```

`scripts/test_admin_database.cjs` also applies this migration twice and checks two
teachers/two students against real PostgreSQL RLS, using the PGlite setup documented
in `ADMIN_SETUP.md`.

Existing background SQLite-to-Supabase synchronization still requires appropriate
server-side credentials; this change does not relax database policies to permit
anonymous synchronization. Grade-save error handling and synchronization reliability
remain separate follow-up work.
