import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
try {
 await db.exec(await read('./fixture.sql'));
 const before = await db.query('SELECT count(*)::int AS n FROM public.profile_modules');
 await db.exec('BEGIN;\n' + await read('../../supabase/proposals/20261015201030_foundry_scope_legacy_module_access.sql') + '\nCOMMIT;');
 const after = await db.query('SELECT count(*)::int AS n FROM public.profile_modules');
 assert.equal(after.rows[0].n, before.rows[0].n, 'Temporary test grants must roll back');
 await db.exec(`SET request.jwt.claim.sub=''; SET ROLE authenticated;`);
 const missing = await db.query('SELECT foundry_auth.is_admin() AS admin, (SELECT count(*)::int FROM public.trips) AS trips');
 assert.deepEqual(missing.rows[0], {admin:false,trips:0});
 await assert.rejects(db.exec("INSERT INTO public.ingestion_jobs(source) VALUES ('upload')"), /permission denied/);
 await db.exec('RESET ROLE; SET ROLE anon;');
 await assert.rejects(db.query('SELECT * FROM public.trips'), /permission denied/);
 await db.exec('RESET ROLE; SET ROLE service_role;');
 await db.exec("INSERT INTO public.ingestion_jobs(source) VALUES ('synthetic-worker-test')");
 await db.exec('RESET ROLE;');
 console.log('PASS: admin reads; denied module reads; every allowed module; narrow Travel/payables scope; no anonymous reads; no browser writes; worker write; no-identity denial; temporary grants rolled back. Synthetic PostgreSQL fixture only.');
} finally { await db.close(); }
