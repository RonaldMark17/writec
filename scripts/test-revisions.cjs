// Isolated PostgreSQL integration checks. No network or project credentials.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const read = name => readFileSync(resolve(__dirname, '..', name), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql AS $$ SELECT current_setting('test.role', true) $$;
      CREATE TABLE public."userTable"(id UUID PRIMARY KEY, role TEXT, account_status TEXT);
      CREATE TABLE public."classroomTable"(id UUID PRIMARY KEY, teacher_id UUID, is_archived BOOLEAN DEFAULT false);
      CREATE TABLE public."assignmentTable"(id UUID PRIMARY KEY, classroom_id UUID, teacher_id UUID, due_date TIMESTAMPTZ, accept_late_submissions BOOLEAN);
      CREATE TABLE public."classroomMembers"(classroom_id UUID, student_id UUID);
      CREATE TABLE public."submissionTable"(id UUID PRIMARY KEY, assignment_id UUID, classroom_id UUID, student_id UUID,
        essay_title TEXT, file_url TEXT, transcribed_text TEXT, grade TEXT, feedback TEXT, status TEXT,
        scan_result JSONB, plagiarism_score NUMERIC, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE public.submission_grades(submission_id TEXT);
      CREATE FUNCTION public.writecheck_active() RETURNS BOOLEAN LANGUAGE sql AS $$
        SELECT EXISTS (SELECT 1 FROM public."userTable" WHERE id = auth.uid() AND account_status = 'active') $$;
      CREATE FUNCTION public.current_account() RETURNS JSONB LANGUAGE sql AS $$
        SELECT to_jsonb(u) FROM public."userTable" u WHERE id = auth.uid() $$;
    `);
    const security = read('submission_security.sql');
    for (const name of ['can_use_assignment', 'can_access_submission', 'guard_submission_fields']) {
      const start = security.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      await db.exec(security.slice(start, security.indexOf('$$;', start) + 3));
    }
    await db.exec('CREATE TRIGGER guard_submission_fields BEFORE INSERT OR UPDATE ON public."submissionTable" FOR EACH ROW EXECUTE FUNCTION public.guard_submission_fields();');
    for (const file of ['submission_release.sql', 'submission_processing.sql', 'submission_provenance.sql', 'student_resubmission.sql', 'submission_revisions.sql', 'submission_teacher_edit.sql', 'submission_match_evidence.sql']) await db.exec(read(file));
    await db.exec(read('submission_revisions.sql')); // Repeatable migration.
    await db.exec(read('submission_teacher_edit.sql'));
    await db.exec(read('submission_match_evidence.sql'));
    await db.exec(`
      SET test.role = 'service_role';
      INSERT INTO public."userTable" VALUES ('${id(1)}','teacher','active'),('${id(2)}','student','active'),('${id(3)}','teacher','active'),('${id(4)}','student','active');
      INSERT INTO public."classroomTable" VALUES ('${id(10)}','${id(1)}',false);
      INSERT INTO public."classroomMembers" VALUES ('${id(10)}','${id(2)}');
      INSERT INTO public."assignmentTable" VALUES ('${id(20)}','${id(10)}','${id(1)}','2000-01-01',false);
      INSERT INTO public."submissionTable" (id,assignment_id,classroom_id,student_id,essay_title,file_url,transcribed_text,grade,feedback,status)
        VALUES ('${id(30)}','${id(20)}','${id(10)}','${id(2)}','Original','${id(2)}/${id(20)}/old.txt','Earlier essay','80','Private grade feedback','graded');
      UPDATE public.submission_jobs SET state = 'ready';
      GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.can_access_submission(TEXT,BOOLEAN), public.can_use_assignment(TEXT,BOOLEAN) TO authenticated;
    `);
    const login = async (who, role = 'authenticated') => {
      await db.exec(`RESET ROLE; SET test.uid = '${id(who)}'; SET test.role = '${role}'; SET ROLE ${role};`);
    };
    const query = async (sql, args = []) => (await db.query(sql, args)).rows;
    await login(1, 'service_role');
    const evidenceJob = (await query('SELECT id FROM public.submission_jobs WHERE submission_id = $1', [id(30)]))[0].id;
    await query('SELECT public.save_submission_match_artifact($1,$2,$3)', [evidenceJob, 'r', JSON.stringify({ranges:[]})]);
    await query('SELECT public.save_submission_match_artifact($1,$2,$3)', [evidenceJob, 'r', JSON.stringify({ranges:[{start:0,end:5}]})]);
    assert.equal((await query('SELECT * FROM public.submission_match_evidence')).length, 1);
    await login(2);
    await assert.rejects(query('SELECT * FROM public.submission_match_evidence'), /permission denied/);
    await assert.rejects(query('SELECT public.save_submission_match_artifact($1,$2,$3)', [evidenceJob, 'r', '{}']), /permission denied/);
    await login(1);
    await assert.rejects(query('SELECT * FROM public.submission_match_evidence'), /permission denied/);
    await login(1, 'service_role');
    await query('UPDATE public.submission_jobs SET id = gen_random_uuid() WHERE submission_id = $1', [id(30)]);
    assert.equal((await query('SELECT * FROM public.submission_match_evidence')).length, 0);
    const edit = (text, expected = 'Earlier essay') => query('SELECT public.edit_submission_transcription($1,$2,$3) AS result', [id(30), text, expected]);
    await login(2);
    await assert.rejects(edit('Student edit'), /Only the classroom teacher/);
    await login(3);
    await assert.rejects(edit('Other teacher edit'), /Only the classroom teacher/);
    await login(1);
    await assert.rejects(edit('  '), /Enter extracted/);
    await assert.rejects(edit('Corrected', 'Outdated'), /transcription changed/);
    const corrected = (await edit('Corrected'))[0].result;
    assert.equal(corrected.transcribed_text, 'Corrected');
    await login(1, 'service_role');
    await db.exec('RESET ROLE');
    const unchanged = (await query('SELECT * FROM public."submissionTable" WHERE id = $1', [id(30)]))[0];
    assert.equal(unchanged.grade, '80');
    assert.equal(unchanged.file_url, `${id(2)}/${id(20)}/old.txt`);
    await query(`UPDATE public."submissionTable" SET transcribed_text = 'Earlier essay', scan_result = '{"mode":"classroom","score":24}', plagiarism_score = 24 WHERE id = $1`, [id(30)]);
    await login(1);
    assert.equal((await edit('Corrected again'))[0].result.scan_result.stale, true);
    assert.equal((await query('SELECT public.submission_report_verified($1) AS ok',[id(30)]))[0].ok, false);
    await login(1, 'service_role');
    await db.exec('RESET ROLE');
    await query(`UPDATE public."submissionTable" SET transcribed_text = 'Earlier essay', scan_result = NULL, plagiarism_score = NULL WHERE id = $1`, [id(30)]);
    await query(`UPDATE public.submission_jobs SET state = 'processing' WHERE submission_id = $1`,[id(30)]);
    await login(1);
    await assert.rejects(edit('Racing edit'), /Wait for processing/);
    await login(1, 'service_role');
    await db.exec('RESET ROLE');
    await query(`UPDATE public.submission_jobs SET state = 'ready' WHERE submission_id = $1`,[id(30)]);
    const request = message => query('SELECT public.request_submission_revision($1,$2) AS result', [id(30), message]);
    await login(3);
    await assert.rejects(request('Revise'), /Only the classroom teacher/);
    await login(2);
    await assert.rejects(request('Revise'), /Only the classroom teacher/);
    await assert.rejects(query('SELECT * FROM public.submission_revisions'), /permission denied/);
    await assert.rejects(query('SELECT public.submit_requested_revision($1,$2,$3,$4,$5,$6)', [id(30),id(2),id(40),'x','x','x']), /permission denied/);
    await login(1);
    await assert.rejects(request('   '), /Enter revision instructions/);
    const revision = (await request('Add evidence and improve the conclusion.'))[0].result.id;
    assert.equal((await request('Duplicate click'))[0].result.id, revision);
    await login(2);
    let result = (await query('SELECT public.list_submission_results() AS result'))[0].result[0];
    assert.equal(result.revision_request.id, revision);
    assert.equal(result.grade, null);
    assert.equal(result.feedback, null);
    assert.equal(result.revision_history[0].transcribed_text, 'Earlier essay');
    assert.equal(result.revision_history[0].grade, undefined);
    await login(4);
    assert.deepEqual((await query('SELECT public.submission_revision_history($1) AS result', [id(30)]))[0].result, []);
    assert.deepEqual((await query('SELECT public.submission_history_files() AS result'))[0].result, []);
    await db.exec("RESET ROLE; SET test.role = 'service_role';");
    await assert.rejects(query('UPDATE public."submissionTable" SET grade = $1 WHERE id = $2', ['90', id(30)]), /Wait for the student/);
    const values = [id(30), id(2), revision, 'Revised essay', `${id(2)}/${id(20)}/new.txt`, 'Updated evidence'];
    const submit = args => query('SELECT public.submit_requested_revision($1,$2,$3,$4,$5,$6) AS result', args);
    await assert.rejects(submit([id(30),id(4),...values.slice(2)]), /does not belong/);
    await assert.rejects(submit([id(30),id(2),id(40),...values.slice(3)]), /No matching revision/);
    await db.exec(`UPDATE public."classroomTable" SET is_archived = true;`);
    await assert.rejects(submit(values), /read-only/);
    await db.exec(`UPDATE public."classroomTable" SET is_archived = false;`);
    assert.equal((await submit(values))[0].result.already_submitted, false);
    assert.equal((await submit(values))[0].result.already_submitted, true);
    await assert.rejects(submit([...values.slice(0,5), 'Different retry']), /already been completed/);
    const row = (await query('SELECT * FROM public."submissionTable"'))[0];
    assert.equal(row.transcribed_text, 'Updated evidence');
    assert.equal(row.grade, null);
    assert.equal(row.returned_at, null);
    assert.equal((await query('SELECT state FROM public.submission_jobs'))[0].state, 'submitted');
    await login(2);
    result = (await query('SELECT public.list_submission_results() AS result'))[0].result[0];
    assert.equal(result.revision_request, null);
    assert.equal(result.revision_history.length, 1);
    assert.equal(result.revision_history[0].file_url, `${id(2)}/${id(20)}/old.txt`);
    assert.ok(result.revision_history[0].completed_at);
    await login(1);
    assert.equal((await query('SELECT public.can_access_essay_file($1) AS allowed', [`${id(2)}/${id(20)}/old.txt`]))[0].allowed, true);
    await assert.rejects(request('Another revision'), /Wait for processing/);
    await login(2);
    assert.equal((await query('SELECT public.can_access_essay_file($1,true) AS allowed', [`${id(2)}/${id(20)}/old.txt`]))[0].allowed, false);
    console.log('PASS: revision authorization, snapshots, privacy, archived classes, deadline reopening, duplicate requests/retries, history files, and processing reset.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
