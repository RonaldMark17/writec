// Isolated PostgreSQL safety checks. Does not contact or mutate a live project.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const read = file => readFileSync(file, 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE "userTable"(id uuid PRIMARY KEY, role text, account_status text);
      CREATE TABLE "classroomTable"(id uuid PRIMARY KEY, teacher_id uuid, classroom_name text, section text);
      CREATE TABLE "classroomMembers"(classroom_id uuid, student_id uuid);
      CREATE TABLE "assignmentTable"(id uuid PRIMARY KEY, classroom_id uuid REFERENCES "classroomTable", teacher_id uuid, title text, due_date timestamptz);
      CREATE TABLE "submissionTable"(id uuid PRIMARY KEY, assignment_id uuid, classroom_id uuid, student_id uuid,
        grade text, feedback text, transcribed_text text, scan_result jsonb, file_url text);
      CREATE FUNCTION public.writecheck_active() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
        SELECT EXISTS(SELECT 1 FROM public."userTable" WHERE id=auth.uid() AND account_status='active') $$;`);
    const security = read('submission_security.sql');
    const start = security.indexOf('CREATE OR REPLACE FUNCTION public.can_manage_classroom(');
    await db.exec(security.slice(start, security.indexOf('$$;', start) + 3));
    // Reuse the actual related-table definitions, including their FKs.
    for (const [file, table] of [
      ['supabase_schema.sql','submission_grades'], ['assignment_comments.sql','assignment_comments'],
      ['submission_processing.sql','submission_jobs'], ['submission_revisions.sql','submission_revisions'],
      ['submission_match_evidence.sql','submission_match_evidence'], ['in_app_notifications.sql','notifications'],
    ]) {
      const source = read(file), begin = source.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      await db.exec(source.slice(begin, source.indexOf(');',begin)+2));
      if (table === 'submission_jobs') await db.exec('CREATE UNIQUE INDEX submission_jobs_id_idx ON submission_jobs(id)');
    }
    await db.exec(read('assignment_deletion.sql'));
    await db.exec(read('assignment_deletion.sql')); // Repeatable.
    await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
      GRANT SELECT, DELETE ON "assignmentTable" TO authenticated;
      ALTER TABLE "assignmentTable" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_all ON "assignmentTable" FOR ALL TO authenticated USING(true);
      CREATE POLICY assignment_delete_scope ON "assignmentTable" AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
      INSERT INTO "userTable" VALUES ('${id(1)}','teacher','active'),('${id(2)}','teacher','active'),
        ('${id(3)}','student','active'),('${id(4)}','admin','active'),('${id(5)}','teacher','inactive');
      INSERT INTO "classroomTable" VALUES ('${id(10)}','${id(1)}','CSST101','3IS1'),('${id(11)}','${id(2)}','Other class','2');
      INSERT INTO "classroomMembers" VALUES ('${id(10)}','${id(3)}');
      INSERT INTO "assignmentTable" VALUES ('${id(20)}','${id(10)}','${id(1)}','Essay A',null),
        ('${id(21)}','${id(10)}','${id(1)}','Essay B',null),('${id(22)}','${id(11)}','${id(2)}','Other assignment',null);
      INSERT INTO "submissionTable" VALUES ('${id(30)}','${id(20)}','${id(10)}','${id(3)}','80','Feedback','Essay','{"score":34}','private/a'),
        ('${id(31)}','${id(21)}','${id(10)}','${id(3)}','90','Keep feedback','Keep essay','{"score":57.7}','private/b');
      INSERT INTO submission_grades(submission_id,grade) VALUES ('${id(30)}','80'),('${id(31)}','90');
      INSERT INTO submission_jobs(submission_id,id,state) VALUES ('${id(30)}','${id(40)}','ready'),('${id(31)}','${id(41)}','ready');
      INSERT INTO submission_match_evidence VALUES ('${id(40)}','matches','{}'),('${id(41)}','matches','{}');
      INSERT INTO submission_revisions(submission_id,requested_by,message,snapshot) VALUES ('${id(30)}','${id(1)}','Revise','{}'),('${id(31)}','${id(1)}','Keep','{}');
      INSERT INTO assignment_comments(assignment_id,classroom_id,student_id,comment_text) VALUES ('${id(20)}','${id(10)}','${id(3)}','A comment'),('${id(21)}','${id(10)}','${id(3)}','B comment');
      ALTER TABLE assignment_comments ADD COLUMN visibility text DEFAULT 'private';
      INSERT INTO assignment_comments(assignment_id,classroom_id,student_id,comment_text,visibility) VALUES ('${id(20)}','${id(10)}','${id(3)}','Class comment','class');
      INSERT INTO notifications(recipient_user_id,type,title,message,classroom_id,assignment_id,event_key) VALUES
        ('${id(3)}','assignment_created','A','Message','${id(10)}','${id(20)}','a'),('${id(3)}','assignment_created','B','Keep','${id(10)}','${id(21)}','b');`);
    const as = async (who, role='authenticated') => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('test.uid',$1,false)",[who ? id(who) : '']);
      await db.exec(`SET ROLE ${role}`);
    };
    const remove = (assignment=id(20), classroom=id(10), title='Essay A', ack=true) =>
      db.query('SELECT delete_assignment_confirmed($1,$2,$3,$4) AS result',[assignment,classroom,title,ack]);
    const tables = ['userTable','classroomTable','classroomMembers','assignmentTable','submissionTable','submission_grades','submission_jobs','submission_match_evidence','submission_revisions','assignment_comments','notifications'];
    const snapshot = async () => {
      await db.exec('RESET ROLE');
      return Object.fromEntries(await Promise.all(tables.map(async table => [table,(await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows])));
    };
    const before = await snapshot();
    for (const who of [null,2,3,4,5]) {
      await as(who);
      await assert.rejects(remove(), error => error.code === '42501');
      await assert.rejects(db.query('SELECT assignment_deletion_preview($1,$2)',[id(20),id(10)]), error => error.code === '42501');
    }
    await as(null,'anon');
    await assert.rejects(remove(), error => error.code === '42501');
    await as(1);
    for (const args of [[id(22),id(10),'Other assignment'],[id(22),id(11),'Other assignment'],[id(20),id(11)],['invalid',id(10)]]) {
      await assert.rejects(remove(...args), error => error.code === '42501');
    }
    for (const [title,ack] of [['',true],['DELETE',true],['Essay',true],['essay a',true],['Essay A',false],['Essay A',null],[null,true]]) {
      await assert.rejects(remove(id(20),id(10),title,ack), error => error.code === '22023');
    }
    assert.equal((await db.query('DELETE FROM "assignmentTable" WHERE id=$1 RETURNING id',[id(20)])).rows.length,0);
    const preview=(await db.query('SELECT assignment_deletion_preview($1,$2) AS result',[id(20),id(10)])).rows[0].result;
    assert.equal(preview.submissions,1); assert.equal(preview.graded,1); assert.equal(preview.comments,2); assert.equal(preview.students,1);
    assert.deepEqual(await snapshot(),before);

    // A late failure rolls back ALL previously deleted children.
    await db.exec(`CREATE FUNCTION fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$;
      CREATE TRIGGER fail_delete BEFORE DELETE ON "assignmentTable" FOR EACH ROW EXECUTE FUNCTION fail_delete();`);
    await as(1); await assert.rejects(remove(), /Injected failure/);
    assert.deepEqual(await snapshot(),before);
    await db.exec('DROP TRIGGER fail_delete ON "assignmentTable"');
    // Unknown cascading relationships must fail closed.
    await db.exec('CREATE TABLE unexpected_child(id uuid REFERENCES "assignmentTable" ON DELETE CASCADE)');
    await as(1); await assert.rejects(remove(), /additional database relationships/);
    assert.deepEqual(await snapshot(),before);
    await db.exec('DROP TABLE unexpected_child');
    await db.query("UPDATE submission_jobs SET state='processing' WHERE submission_id=$1",[id(30)]);
    await as(1); await assert.rejects(remove(), /finish processing/);
    await db.exec('RESET ROLE'); await db.query("UPDATE submission_jobs SET state='ready' WHERE submission_id=$1",[id(30)]);
    assert.deepEqual(await snapshot(),before);

    await as(1);
    assert.equal((await remove(id(20),id(10),'  Essay A  ')).rows[0].result.deleted,true);
    const after=await snapshot();
    for (const table of ['userTable','classroomTable','classroomMembers']) assert.deepEqual(after[table],before[table]);
    assert.deepEqual(after.assignmentTable,before.assignmentTable.filter(item=>item.row.id!==id(20)));
    for (const table of tables.filter(t=>!['userTable','classroomTable','classroomMembers','assignmentTable'].includes(t))) {
      const [field,key] = table === 'submissionTable' ? ['id',id(30)]
        : ['assignment_comments','notifications'].includes(table) ? ['assignment_id',id(20)]
        : table === 'submission_match_evidence' ? ['job_id',id(40)] : ['submission_id',id(30)];
      assert.deepEqual(after[table],before[table].filter(item=>item.row[field]!==key),`${table}: only target children removed`);
    }
    await as(1); await assert.rejects(remove(),error=>error.code==='42501');
    await db.exec('RESET ROLE');
    await assert.rejects(db.query('INSERT INTO "submissionTable"(id,assignment_id) VALUES($1,$2)',[id(99),id(20)]),error=>error.code==='23503');
    console.log('PASS: authorization, strict confirmation, direct DELETE denial, exact scope, rollback, unknown FK rejection, busy jobs, sibling/classroom preservation and orphan prevention.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
