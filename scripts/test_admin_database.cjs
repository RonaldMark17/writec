// Disposable PostgreSQL (PGlite) integration test, using representative base tables.
// npm install --prefix <temp-dir> --no-save @electric-sql/pglite
// PGLITE_MODULE=<temp-dir>/node_modules/@electric-sql/pglite node scripts/test_admin_database.cjs
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(), email text);
      CREATE TABLE public."userTable"(id uuid PRIMARY KEY REFERENCES auth.users, full_name text, email text, role text);
      CREATE TABLE public."classroomTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id uuid REFERENCES public."userTable", classroom_name text, classroom_code text, subject text, section text, created_at timestamptz DEFAULT now());
      CREATE TABLE public."classroomMembers"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", student_id uuid REFERENCES public."userTable", UNIQUE(classroom_id,student_id));
      CREATE TABLE public."assignmentTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", teacher_id uuid REFERENCES public."userTable", title text, instructions text, due_date timestamptz, created_at timestamptz DEFAULT now());
      CREATE TABLE public."submissionTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", assignment_id uuid REFERENCES public."assignmentTable", student_id uuid REFERENCES public."userTable", file_url text, grade text, feedback text, status text, essay_title text, created_at timestamptz DEFAULT now());
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean);
      INSERT INTO storage.buckets VALUES ('essay-submissions',true);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY existing_storage ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
      GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO authenticated;
      DO $$ DECLARE t text; BEGIN
        FOREACH t IN ARRAY ARRAY['userTable','classroomTable','classroomMembers','assignmentTable','submissionTable'] LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
          EXECUTE format('CREATE POLICY existing_policy ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',t);
        END LOOP;
      END $$;
    `);
    const root = path.resolve(__dirname, '..');
    await db.exec(fs.readFileSync(path.join(root, 'supabase_schema.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'admin_schema.sql'), 'utf8'));
    // Rerunning the migration must be safe and must not manufacture audit entries.
    await db.exec(fs.readFileSync(path.join(root, 'admin_schema.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'submission_security.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'submission_security.sql'), 'utf8'));
    const admin = '00000000-0000-0000-0000-000000000001';
    const teacher = '00000000-0000-0000-0000-000000000002';
    const student = '00000000-0000-0000-0000-000000000003';
    const classId = '00000000-0000-0000-0000-000000000004';
    const assignment = '00000000-0000-0000-0000-000000000005';
    await db.exec(`
      INSERT INTO auth.users(id,email) VALUES ('${admin}','admin@example.com'),('${teacher}','teacher@example.com'),('${student}','student@example.com');
      INSERT INTO public."userTable"(id,full_name,email,role) VALUES ('${admin}','Admin','admin@example.com','admin'),('${teacher}','Teacher','teacher@example.com','teacher'),('${student}','Student','student@example.com','student');
      INSERT INTO public."classroomTable"(id,teacher_id,classroom_name,classroom_code) VALUES ('${classId}','${teacher}','English','ENG1');
      INSERT INTO public."classroomMembers"(classroom_id,student_id) VALUES ('${classId}','${student}');
      INSERT INTO public."assignmentTable"(id,classroom_id,teacher_id,title) VALUES ('${assignment}','${classId}','${teacher}','Essay');
      INSERT INTO public."submissionTable"(classroom_id,assignment_id,student_id,essay_title) VALUES ('${classId}','${assignment}','${student}','My essay');
      INSERT INTO storage.objects(bucket_id) VALUES ('essay-submissions');
    `);
    async function asUser(id) {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false); SET ROLE authenticated");
    }
    async function rpc(sql, args = []) { return (await db.query(sql, args)).rows[0]?.result; }
    await asUser(admin);
    const dashboard = await rpc("SELECT public.admin_read('dashboard') AS result");
    assert.equal(dashboard.students, 1); assert.equal(dashboard.teachers, 1); assert.equal(dashboard.classes, 1); assert.equal(dashboard.submissions, 1);
    const users = await rpc("SELECT public.admin_read('users', '{\"role\":\"student\",\"search\":\"student@\"}') AS result");
    assert.equal(users.total, 1);
    const details = await rpc("SELECT public.admin_read('class',jsonb_build_object('id',$1::text)) AS result", [classId]);
    assert.equal(details.students[0].full_name, 'Student');
    const logs = await rpc("SELECT public.admin_read('logs') AS result");
    assert.equal(logs.total, 7);
    await assert.rejects(() => db.query("SELECT public.admin_set_account_status($1,'inactive')", [admin]), /Only student and teacher/);
    await db.query("SELECT public.admin_set_account_status($1,'inactive')", [student]);
    await db.query("SELECT public.admin_set_account_status($1,'inactive')", [student]);
    assert.equal((await rpc("SELECT public.admin_read('logs') AS result")).total, 8);
    await asUser(student);
    assert.equal((await rpc('SELECT public.current_account() AS result')).account_status, 'inactive');
    assert.equal((await db.query('SELECT * FROM public."classroomTable"')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length, 0);
    await assert.rejects(() => db.query("SELECT public.update_my_profile('Changed')"), /inactive/);
    await assert.rejects(() => db.query('SELECT public.get_classroom_roster($1)', [classId]), /access/);
    await assert.rejects(() => db.query("SELECT public.admin_read('dashboard')"), /Admin access/);
    await assert.rejects(() => db.query('UPDATE public."userTable" SET role=\'admin\' WHERE id=$1', [student]), /protected/);
    await asUser(admin);
    await db.query("SELECT public.admin_set_account_status($1,'active')", [student]);
    await asUser(student);
    assert.equal((await db.query('SELECT public.get_classroom_roster($1)', [classId])).rows.length, 1);
    await db.query("SELECT public.update_my_profile('New Student Name')");
    await assert.rejects(() => db.query('UPDATE public."userTable" SET role=\'admin\' WHERE id=$1', [student]), /protected/);
    await assert.rejects(() => db.query("SELECT public.admin_set_account_status($1,'inactive')", [teacher]), /Admin access/);
    await asUser(teacher);
    await db.query("SELECT public.update_my_profile('New Teacher Name')");
    assert.equal((await db.query('SELECT teacher_name FROM public."classroomTable"')).rows[0].teacher_name, 'New Teacher Name');
    await assert.rejects(() => db.query("SELECT public.admin_read('users')"), /Admin access/);

    // Two classrooms, two teachers and two students: enforce the real boundaries.
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false)");
    const teacher2 = '00000000-0000-0000-0000-000000000006';
    const student2 = '00000000-0000-0000-0000-000000000007';
    const class2 = '00000000-0000-0000-0000-000000000008';
    const assignment2 = '00000000-0000-0000-0000-000000000009';
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${teacher2}'),('${student2}');
      INSERT INTO public."userTable"(id,full_name,role) VALUES ('${teacher2}','Teacher Two','teacher'),('${student2}','Student Two','student');
      INSERT INTO public."classroomTable"(id,teacher_id,classroom_name) VALUES ('${class2}','${teacher2}','Science');
      INSERT INTO public."assignmentTable"(id,classroom_id,teacher_id,title) VALUES ('${assignment2}','${class2}','${teacher2}','Science essay');
      INSERT INTO public."classroomMembers"(classroom_id,student_id) VALUES ('${class2}','${student2}');
      INSERT INTO public."submissionTable"(classroom_id,assignment_id,student_id,essay_title,file_url) VALUES ('${class2}','${assignment2}','${student2}','Essay 2','${student2}/${assignment2}/essay.txt');
      INSERT INTO storage.objects(bucket_id,name) VALUES ('essay-submissions','${student2}/${assignment2}/essay.txt');
    `);
    await asUser(student);
    let permitted = await rpc('SELECT public.accessible_submissions() AS result');
    assert.equal(permitted.length,1);
    assert.equal(permitted[0].student_id,student);
    assert.equal((await db.query('SELECT * FROM public."submissionTable"')).rows.length,1);
    assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
    await assert.rejects(() => db.query('INSERT INTO public."submissionTable"(assignment_id,classroom_id,student_id) VALUES ($1,$2,$3)',[assignment2,class2,student]), /enrolled/);
    await assert.rejects(() => db.query('INSERT INTO public."submissionTable"(assignment_id,classroom_id,student_id,grade) VALUES ($1,$2,$3,\'100\')',[assignment,classId,student]), /grades/);
    assert.equal((await db.query('UPDATE public."submissionTable" SET grade=\'100\' RETURNING id')).rows.length,0);
    await asUser(teacher);
    assert.equal((await db.query('UPDATE public."submissionTable" SET grade=\'85\' RETURNING id')).rows.length,1);
    await assert.rejects(() => db.query('UPDATE public."submissionTable" SET student_id=$1',[student2]), /identity/);
    assert.equal((await db.query('UPDATE public."classroomTable" SET teacher_id=$1 WHERE id=$2 RETURNING id',[teacher,class2])).rows.length,0);
    await asUser(student2);
    assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1);
    assert.equal((await db.query('DELETE FROM storage.objects RETURNING id')).rows.length,0);
    await asUser(teacher2);
    permitted = await rpc('SELECT public.accessible_submissions() AS result');
    assert.equal(permitted.length,1);
    assert.equal(permitted[0].student_id,student2);
    assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,1);
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false)");
    await db.exec(fs.readFileSync(path.join(root, 'submission_release.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'submission_release.sql'), 'utf8'));
    await asUser(student);
    assert.equal((await db.query('SELECT * FROM public."submissionTable"')).rows.length, 0);
    let privateRows = await rpc('SELECT public.list_submission_results() AS result');
    assert.equal(privateRows.length, 1);
    assert.equal(privateRows[0].grade, null);
    assert.equal(privateRows[0].status, 'graded');
    const releaseId = privateRows[0].id;
    await assert.rejects(() => db.query('SELECT public.return_submission($1)', [releaseId]), /classroom teacher/);
    await asUser(teacher2);
    await assert.rejects(() => db.query('SELECT public.return_submission($1)', [releaseId]), /classroom teacher/);
    const ungraded = await rpc('SELECT public.list_submission_results() AS result');
    await assert.rejects(() => db.query('SELECT public.return_submission($1)', [ungraded[0].id]), /Save a grade/);
    await asUser(teacher);
    await db.query('SELECT public.return_submission($1)', [releaseId]);
    await asUser(student);
    privateRows = await rpc('SELECT public.list_submission_results() AS result');
    assert.equal(privateRows[0].grade, '85');
    assert.ok(privateRows[0].returned_at);
    assert.equal((await db.query('SELECT * FROM public."submissionTable"')).rows.length, 1);
    await asUser(teacher);
    await db.query(`UPDATE public."submissionTable" SET feedback='Changed draft' WHERE id=$1`, [releaseId]);
    await asUser(student);
    privateRows = await rpc('SELECT public.list_submission_results() AS result');
    assert.equal(privateRows[0].returned_at, null);
    assert.equal(privateRows[0].feedback, null);
    assert.equal((await db.query('SELECT * FROM public."submissionTable"')).rows.length, 0);
    // Queue lifecycle and permissions use actual PostgreSQL functions and triggers.
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false)");
    await db.exec(fs.readFileSync(path.join(root, 'submission_processing.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'submission_processing.sql'), 'utf8'));
    const queuedId = '00000000-0000-0000-0000-000000000010';
    const queueAssignment = '00000000-0000-0000-0000-000000000011';
    await db.query('INSERT INTO public."assignmentTable"(id,classroom_id,teacher_id,title) VALUES ($1,$2,$3,$4)',
      [queueAssignment,classId,teacher,'Queue test']);
    await asUser(student);
    const submitted = await rpc('SELECT public.submit_assignment($1,$2,$3,$4) AS result',
      [queuedId,queueAssignment,'Essay',`${student}/${queueAssignment}/new.txt`]);
    assert.equal(submitted.id, queuedId);
    const duplicate = await rpc('SELECT public.submit_assignment($1,$2,$3,$4) AS result',
      ['00000000-0000-0000-0000-000000000012',queueAssignment,'Essay',`${student}/${queueAssignment}/retry.txt`]);
    assert.equal(duplicate.id, queuedId);
    assert.equal(duplicate.already_submitted, true);
    const progress = await rpc('SELECT public.submission_processing_status() AS result');
    assert.equal(progress[queuedId].state, 'submitted');
    assert.ok((await rpc('SELECT public.accessible_submissions() AS result')).some(row => row.id === queuedId));
    await assert.rejects(() => db.query('SELECT * FROM public.submission_jobs'), /permission denied/);
    await assert.rejects(() => db.query('SELECT public.claim_submission_job()'), /permission denied/);
    await assert.rejects(() => db.query('SELECT public.retry_submission_processing($1)', [queuedId]), /classroom teacher/);
    await asUser(teacher2);
    await assert.rejects(() => db.query('SELECT public.retry_submission_processing($1)', [queuedId]), /classroom teacher/);
    async function asWorker() {
      await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role");
    }
    await asWorker();
    const firstJob = await rpc('SELECT public.claim_submission_job() AS result');
    assert.equal(firstJob.submission_id, queuedId);
    assert.equal(await rpc('SELECT public.claim_submission_job() AS result'), null);
    await db.exec("RESET ROLE");
    await db.query("UPDATE public.submission_jobs SET lease_until=now()-interval '1 second' WHERE submission_id=$1", [queuedId]);
    await asWorker();
    const resumed = await rpc('SELECT public.claim_submission_job() AS result');
    assert.equal(resumed.id, firstJob.id);
    assert.notEqual(resumed.lease, firstJob.lease);
    assert.equal(await rpc('SELECT public.finish_submission_job($1,$2,$3,$4,NULL) AS result',
      [queuedId,firstJob.lease,'stale',JSON.stringify({score: 99})]), false);
    assert.equal(await rpc('SELECT public.finish_submission_job($1,$2,NULL,NULL,$3) AS result',
      [queuedId,resumed.lease,'Provider unavailable']), true);
    await asUser(student);
    assert.equal((await rpc('SELECT public.submission_processing_status() AS result'))[queuedId].error, null);
    await asUser(teacher);
    assert.equal((await rpc('SELECT public.submission_processing_status() AS result'))[queuedId].state, 'failed');
    await db.query('SELECT public.retry_submission_processing($1)', [queuedId]);
    await db.query('SELECT public.retry_submission_processing($1)', [queuedId]);
    await db.query(`UPDATE public."submissionTable" SET grade='0' WHERE id=$1`, [queuedId]);
    await assert.rejects(() => db.query('SELECT public.return_submission($1)', [queuedId]), /Finish processing/);
    await asWorker();
    const retried = await rpc('SELECT public.claim_submission_job() AS result');
    assert.equal(retried.id, firstJob.id); // Retry and restart reuse the external scan ID.
    const report = {score: 12, transcribedText: 'Verified text', matchedSources: []};
    assert.equal(await rpc('SELECT public.finish_submission_job($1,$2,$3,$4,NULL) AS result',
      [queuedId,retried.lease,'Verified text',JSON.stringify(report)]), true);
    await asUser(student);
    let ready = (await rpc('SELECT public.list_submission_results() AS result')).find(row => row.id === queuedId);
    for (const field of ['grade','feedback','transcribed_text','scan_result','plagiarism_score']) assert.equal(ready[field], null);
    assert.equal((await db.query('SELECT * FROM public."submissionTable" WHERE id=$1',[queuedId])).rows.length, 0);
    await asUser(teacher);
    await db.query('SELECT public.return_submission($1)', [queuedId]);
    await asUser(student);
    ready = (await rpc('SELECT public.list_submission_results() AS result')).find(row => row.id === queuedId);
    assert.equal(ready.grade, '0');
    assert.equal(ready.transcribed_text, 'Verified text');
    await asUser(teacher);
    await db.query('SELECT public.retry_submission_processing($1,$2)', [queuedId,'Corrected text']);
    await asUser(student);
    ready = (await rpc('SELECT public.list_submission_results() AS result')).find(row => row.id === queuedId);
    assert.equal(ready.returned_at, null);
    assert.equal(ready.scan_result, null);
    await asWorker();
    const corrected = await rpc('SELECT public.claim_submission_job() AS result');
    assert.notEqual(corrected.id, firstJob.id);
    assert.equal(corrected.input_text, 'Corrected text');
    await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(() => db.query("SELECT public.admin_read('dashboard')"), /permission denied/);
    console.log('Database integration checks passed: RPCs, RLS, private results, return controls, atomic submission queue, duplicate retries, lease recovery, stale worker rejection, and repeat migrations.');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
