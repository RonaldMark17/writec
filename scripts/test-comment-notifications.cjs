/** Run with an external @electric-sql/pglite package path; no application dependency. */
const fs = require('fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  const [t, other, s, peer, outsider, A, B, a, b, work] = Array.from({length:10}, (_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
  const a2 = '00000000-0000-0000-0000-000000000011';
  await db.exec(`CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE "userTable" (id uuid PRIMARY KEY, full_name text, role text, account_status text DEFAULT 'active');
    CREATE TABLE "classroomTable" (id uuid PRIMARY KEY, teacher_id uuid, is_archived boolean);
    CREATE TABLE "classroomMembers" (classroom_id uuid, student_id uuid);
    CREATE TABLE "assignmentTable" (id uuid PRIMARY KEY, classroom_id uuid, teacher_id uuid);
    CREATE TABLE "submissionTable" (id uuid PRIMARY KEY, assignment_id uuid, classroom_id uuid, student_id uuid);
    INSERT INTO "userTable" (id,full_name,role) VALUES ('${t}','Teacher','teacher'),('${other}','Other','teacher'),('${s}','Alex Santos','student'),('${peer}','Peer','student'),('${outsider}','Outsider','student');
    INSERT INTO "classroomTable" VALUES ('${A}','${t}',true),('${B}','${other}',true);
    INSERT INTO "classroomMembers" VALUES ('${A}','${s}'),('${A}','${peer}'),('${B}','${outsider}');
    INSERT INTO "assignmentTable" VALUES ('${a}','${A}','${t}'),('${b}','${B}','${other}'),('${a2}','${A}','${t}');
    INSERT INTO "submissionTable" VALUES ('${work}','${a}','${A}','${s}');`);
  for (const [file,names] of [['admin_schema.sql',['writecheck_active']], ['submission_security.sql',['can_manage_classroom','can_use_assignment','can_access_submission']]]) {
    const source=fs.readFileSync(file,'utf8');
    for (const name of names) {const start=source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);const end=source.indexOf('$$;',source.indexOf('AS $$',start)); await db.exec(source.slice(start,end+3));}
  }
  await db.exec(fs.readFileSync('assignment_comments.sql','utf8'));
  await db.exec(`ALTER TABLE "classroomTable" ADD COLUMN classroom_name text DEFAULT 'English'; ALTER TABLE "assignmentTable" ADD COLUMN title text DEFAULT 'Essay';`);
  await db.exec(fs.readFileSync('comment_visibility.sql','utf8'));
  const notifications = fs.readFileSync('in_app_notifications.sql','utf8');
  await db.exec(notifications.slice(0, notifications.indexOf('CREATE OR REPLACE FUNCTION public.notify_assignment_event()')) + 'COMMIT;');
  await db.exec(fs.readFileSync('student_comment_notifications.sql','utf8'));
  await db.exec(fs.readFileSync('student_comment_notifications.sql','utf8')); // safe reapplication
  const as = async id => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid',$1,false)",[id]); await db.exec('SET ROLE authenticated'); };
  const post = (kind, key, text='Question', recipient=null) => db.query('SELECT public.post_assignment_comment($1,$2,$3,$4,$5,$6) AS id',[a,A,text,kind,recipient,key]);
  const all = () => db.query('SELECT * FROM public.notifications ORDER BY type');
  const classKey='10000000-0000-4000-8000-000000000001', privateKey='10000000-0000-4000-8000-000000000002';
  await as(s);
  const original = (await post('class',classKey)).rows[0].id;
  assert.equal((await post('class',classKey)).rows[0].id,original);
  await assert.rejects(post('class',classKey,'Changed retry'));
  await post('private',privateKey,'Secret question');
  await post('private',privateKey,'Secret question');
  await assert.rejects(post('private','10000000-0000-4000-8000-000000000003','   '));
  assert.equal((await all()).rows.length,0);
  await as(peer); assert.equal((await all()).rows.length,0);
  await assert.rejects(db.query('SELECT * FROM public.assignment_comments'));
  await as(t);
  let rows=(await all()).rows;
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.type),['student_class_comment','student_private_comment']);
  assert.ok(rows.every(r=>r.recipient_user_id===t && !r.is_read && r.assignment_id===a && r.classroom_id===A));
  assert.equal(rows[1].metadata.student_id,s);
  assert.equal(rows[1].metadata.visibility,'private');
  assert.equal(rows[1].metadata.comment_text,undefined);
  await db.query('SELECT public.mark_notifications_read($1)',[rows[1].id]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.notifications WHERE NOT is_read')).rows[0].n,1);
  await post('private','10000000-0000-4000-8000-000000000004','Teacher reply',s);
  // Existing behavior disallows teacher class posts; failed posts never notify.
  await assert.rejects(post('class','10000000-0000-4000-8000-000000000005'));
  assert.equal((await all()).rows.length,2);
  await as(other); assert.equal((await all()).rows.length,0);
  await db.exec('RESET ROLE');
  await db.query('UPDATE "classroomTable" SET teacher_id=$1 WHERE id=$2',[other,A]);
  await db.query('INSERT INTO "classroomMembers" VALUES ($1,$2)',[A,t]);
  await as(t); assert.equal((await all()).rows.length,0);
  await db.close();
  console.log('PASS: class/private events, retry deduplication, rollback, no self-notifications, recipient RLS, read counts and ownership changes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
