// Exercise the actual Supabase trigger SQL locally, without creating live accounts.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const db = new PGlite();
  let checks = 0;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id text PRIMARY KEY, email text, raw_user_meta_data jsonb);
      CREATE TABLE public."userTable"(id text, email text, role text, account_status text, registered_at timestamp);
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT 'test'::text $$;
      CREATE FUNCTION public.writecheck_active() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      INSERT INTO auth.users VALUES ('legacy', 'old@school.edu.ph', '{}');`);
    for (const file of ['registration_edu_ph.sql', 'registration_required_fields.sql', 'registration_exact_domain.sql', 'registration_exact_domain.sql']) {
      await db.exec(readFileSync(file, 'utf8'));
    }
    await db.exec(`CREATE TRIGGER test_profile_guard BEFORE INSERT OR UPDATE ON public."userTable"
      FOR EACH ROW EXECUTE FUNCTION public.guard_profile_fields();`);
    for (const role of ['student', 'teacher']) {
      for (const email of ['student@edu.com.ph', 'student@gmail.com', 'student@yahoo.com', 'student@edu.ph', 'student@-school.edu.ph', 'student@school..edu.ph', 'student@school.edu.ph.fake.com', 'student@edu.com', 'student@edu.com.ph.fake.com', 'student@other.edu.com.ph']) {
        await assert.rejects(() => db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [email, email, JSON.stringify({ full_name: 'Alex', role })]), /institutional email address/);
        checks++;
      }
      await db.query('INSERT INTO auth.users VALUES ($1,$2,$3)', [role, `${role}@SCHOOL.EDU.PH`, JSON.stringify({ full_name: 'Alex', role })]);
      await db.query('INSERT INTO public."userTable"(id,email,role) VALUES ($1,$2,$3)', [role, 'forged@example.com', role]);
      const profile = (await db.query('SELECT * FROM public."userTable" WHERE id=$1', [role])).rows[0];
      assert.equal(profile.email, `${role}@SCHOOL.EDU.PH`);
      assert.equal(profile.account_status, 'pending');
      checks++;
    }
    assert.equal((await db.query("SELECT email FROM auth.users WHERE id='legacy'")).rows[0].email, 'old@school.edu.ph');
    checks++;
    console.log(`Exact registration domain SQL: ${checks} checks passed; repeatable, existing accounts preserved.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
