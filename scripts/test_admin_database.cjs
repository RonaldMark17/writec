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
      GRANT USAGE ON SCHEMA auth, public, storage TO anon, authenticated;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(), email text);
      CREATE TABLE public."userTable"(id uuid PRIMARY KEY REFERENCES auth.users, full_name text, email text, role text);
      CREATE TABLE public."classroomTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id uuid REFERENCES public."userTable", classroom_name text, classroom_code text, subject text, section text, created_at timestamptz DEFAULT now());
      CREATE TABLE public."classroomMembers"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", student_id uuid REFERENCES public."userTable", UNIQUE(classroom_id,student_id));
      CREATE TABLE public."assignmentTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", teacher_id uuid REFERENCES public."userTable", title text, instructions text, due_date timestamptz, created_at timestamptz DEFAULT now());
      CREATE TABLE public."submissionTable"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), classroom_id uuid REFERENCES public."classroomTable", assignment_id uuid REFERENCES public."assignmentTable", student_id uuid REFERENCES public."userTable", essay_title text, created_at timestamptz DEFAULT now());
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);
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
      await db.exec('SET ROLE authenticated');
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
    await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(() => db.query("SELECT public.admin_read('dashboard')"), /permission denied/);
    console.log('Admin database integration checks passed: real RPCs, RLS, audit triggers, status changes, profile guards, roster, teacher-name sync, and repeat migration.');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
