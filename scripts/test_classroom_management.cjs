/** Isolated PostgreSQL regression test. Run: node scripts/test_classroom_management.cjs <path-to-pglite> */
const fs = require('fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE "userTable" (id text PRIMARY KEY, full_name text, role text, account_status text DEFAULT 'active');
    CREATE TABLE "classroomTable" (id text PRIMARY KEY, teacher_id text, classroom_name text, subject text, section text);
    CREATE TABLE "classroomMembers" (id text PRIMARY KEY, classroom_id text REFERENCES "classroomTable", student_id text REFERENCES "userTable");
    CREATE TABLE "assignmentTable" (id text PRIMARY KEY, classroom_id text REFERENCES "classroomTable", teacher_id text, title text, due_date timestamptz);
    CREATE TABLE "submissionTable" (id text PRIMARY KEY, assignment_id text, classroom_id text, student_id text, grade text, feedback text, created_at timestamptz);
    GRANT SELECT, INSERT, UPDATE ON "assignmentTable" TO authenticated;
    INSERT INTO "userTable" (id,full_name,role) VALUES ('t','Teacher','teacher'),('other','Other teacher','teacher'),('admin','Admin','admin'),('s','Juan Dela Cruz','student'),('outsider','Maria Santos','student');
    INSERT INTO "classroomTable" VALUES ('A','t','Class A','CSST 106','1'),('B','other','Class B','CSST 107','2');
    INSERT INTO "classroomMembers" VALUES ('ma','A','s'),('mb','B','s'),('mo','B','outsider');
    INSERT INTO "assignmentTable" VALUES ('a','A','t','Assignment 1',null),('b','B','other','Other assignment',null);
    INSERT INTO "submissionTable" VALUES ('sa','a','A','s','90','Good','2026-01-01'),('sb','b','B','s','95','','2026-01-01');`);
  // Exercise the real authorization functions from the existing migrations.
  for (const [file, names] of [['admin_schema.sql',['writecheck_active','writecheck_admin']],
    ['submission_security.sql',['can_manage_classroom','can_use_assignment','guard_assignment_identity']]]) {
    const source = fs.readFileSync(file,'utf8');
    for (const name of names) {
      const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const end = source.indexOf('$$;', source.indexOf('AS $$',start));
      await db.exec(source.slice(start,end+3));
    }
  }
  const security = fs.readFileSync('submission_security.sql','utf8');
  await db.exec(security.slice(security.indexOf('DROP POLICY IF EXISTS assignment_create_scope'), security.indexOf('CREATE OR REPLACE FUNCTION public.guard_assignment_identity')));
  await db.exec(`CREATE TRIGGER guard_assignment_identity BEFORE UPDATE ON "assignmentTable" FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_identity();
    CREATE POLICY legacy_read ON "assignmentTable" FOR SELECT TO authenticated USING(true);
    CREATE POLICY teacher_update ON "assignmentTable" FOR UPDATE TO authenticated USING(teacher_id=auth.uid());`);
  await db.exec(fs.readFileSync('classroom_management.sql','utf8'));
  const as = async (id) => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid',$1,false)",[id]); await db.exec('SET ROLE authenticated'); };
  const rejects = async (sql) => { await assert.rejects(db.query(sql)); };
  await as('t');
  await db.query(`INSERT INTO "assignmentTable" VALUES ('new','A','t','New homework',null)`);
  await rejects(`INSERT INTO "assignmentTable" VALUES ('bad','B','t','Wrong classroom',null)`);
  await db.query(`UPDATE "assignmentTable" SET title='Updated homework' WHERE id='new'`);
  await rejects(`UPDATE "assignmentTable" SET classroom_id='B' WHERE id='new'`);
  let rows = (await db.query(`SELECT public.export_classroom_grades('A') AS rows`)).rows[0].rows;
  assert.equal(rows.length,2);
  assert(rows.every(r=>r.subject==='CSST 106' && r.student==='Juan Dela Cruz'));
  assert.equal(rows.find(r=>r.assignment==='Assignment 1').score,'90');
  await rejects(`SELECT public.export_classroom_grades('B')`);
  await rejects(`SELECT public.remove_classroom_student('B','s')`);
  await as('s');
  assert.equal((await db.query(`SELECT * FROM "assignmentTable" WHERE id='new'`)).rows.length,1);
  await rejects(`SELECT public.remove_classroom_student('A','s')`);
  await as('outsider');
  assert.equal((await db.query(`SELECT * FROM "assignmentTable" WHERE classroom_id='A'`)).rows.length,0);
  assert.equal((await db.query(`SELECT * FROM "assignmentTable" WHERE classroom_id='B' AND id='new'`)).rows.length,0);
  await as('other');
  await rejects(`SELECT public.export_classroom_grades('A')`);
  await as('t');
  await db.query(`SELECT public.remove_classroom_student('A','s')`);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT * FROM "userTable" WHERE id='s'`)).rows.length,1);
  assert.deepEqual((await db.query(`SELECT classroom_id FROM "classroomMembers" WHERE student_id='s'`)).rows,[{classroom_id:'B'}]);
  assert.equal((await db.query(`SELECT * FROM "submissionTable" WHERE id='sa'`)).rows.length,1);
  await as('s');
  assert.equal((await db.query(`SELECT * FROM "assignmentTable" WHERE id='new'`)).rows.length,0);
  await as('admin');
  await db.query(`SELECT public.remove_classroom_student('B','outsider')`);
  await db.close();
  console.log('PASS: classroom removal, account preservation, other membership preservation, grade export scope, creation authorization, enrolled/non-enrolled visibility, admin removal.');
})().catch(error => { console.error(error); process.exitCode=1; });
