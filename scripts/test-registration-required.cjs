// Local PostgreSQL test; no network or live Auth account changes.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(email text, raw_user_meta_data jsonb);`);
    const sql = readFileSync(resolve(__dirname, '..', 'registration_required_fields.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // Repeatable migration.
    for (const values of [
      ['', { full_name: 'Alex', role: 'student' }],
      ['a@school.edu.ph', {}],
      ['a@school.edu.ph', { full_name: ' \t\n', role: 'student' }],
      ['a@school.edu.ph', { full_name: 'Alex' }],
      ['a@school.edu.ph', { full_name: 'Alex', role: 'admin' }],
    ]) {
      await assert.rejects(() => db.query('INSERT INTO auth.users VALUES ($1, $2)', [values[0], JSON.stringify(values[1])]), /required for registration/);
    }
    for (const role of ['student', 'teacher']) {
      await db.query('INSERT INTO auth.users VALUES ($1, $2)', [`${role}@school.edu.ph`, JSON.stringify({ full_name: 'Alex Smith', role })]);
    }
    assert.equal((await db.query('SELECT * FROM auth.users')).rows.length, 2);
    console.log('Registration required-fields SQL: 7 checks passed; migration is repeatable.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
