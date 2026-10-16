import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate, loadMigrations } from './check-migration-baseline.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const CLI = fileURLToPath(new URL('./check-migration-baseline.mjs', import.meta.url));
const LEDGER = fileURLToPath(new URL('./fixtures/observed-ledger.json', import.meta.url));
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const clone = v => structuredClone(v);
const sha = s => createHash('sha256').update(s).digest('hex');
const APPLIED = '20261015191718_foundry_restrict_public_data_access.sql';
const APPLIED_SHA = '215030971b570daa249feb563b463c268a345a1cd30c271c12d66f69edb1b4c4';
const realManifest = () => json(fileURLToPath(new URL('./migration-baseline.json', import.meta.url)));

// Synthetic in-memory world: files, a matching manifest and a matching ledger.
function world({ extra = [], recorded = ['0001_a.sql'] } = {}) {
 const names = ['0001_a.sql', '0002_b.sql', ...extra];
 const files = new Map(names.map(n => [n, Buffer.from('-- ' + n)]));
 const manifest = {
  schemaVersion: 1, description: 'synthetic',
  legacyDuplicatePrefixes: [...new Set(names.map(n => n.split('_')[0]))].filter(p => names.filter(n => n.startsWith(p + '_')).length > 1),
  files: names.map(n => ({ filename: n, version: n.split('_')[0], sha256: sha('-- ' + n), status: recorded.includes(n) ? 'recorded_in_ledger' : 'unverified_legacy' })),
 };
 const ledger = { schemaVersion: 1, source: 'synthetic', rows: recorded.map(n => ({ version: n.split('_')[0], name: n.slice(5, -4) })) };
 return { manifest, ledger, files };
}
const errs = w => evaluate(w).errors;
const failsWith = (w, re) => { const r = evaluate(w); assert.equal(r.inventory_consistent, false); assert.equal(r.deploy_allowed, false); assert.match(r.errors.join('\n'), re); };

test('real manifest: 46 files, expected duplicate prefixes, applied digest, only one recorded', () => {
 const m = realManifest();
 assert.equal(m.files.length, 46);
 assert.deepEqual(m.legacyDuplicatePrefixes, ['0008', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0031']);
 assert.equal(m.files.find(f => f.filename === APPLIED).sha256, APPLIED_SHA);
 assert.deepEqual(m.files.filter(f => f.status === 'recorded_in_ledger').map(f => f.filename), [APPLIED]);
 assert.deepEqual(json(LEDGER).rows, [{ version: '20261015191718', name: 'foundry_restrict_public_data_access' }]);
});

test('current repository state is inventory-consistent but deployment is BLOCKED', () => {
 const r = evaluate({ manifest: realManifest(), ledger: json(LEDGER), ...loadMigrations(here + '../../supabase/migrations') });
 assert.deepEqual(r.errors, []);
 assert.equal(r.inventory_consistent, true);
 assert.equal(r.deploy_allowed, false);
 assert.equal(r.unverified_legacy.length, 45);
 assert.deepEqual(Object.keys(r.duplicate_prefixes), ['0008', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0031']);
 assert.equal(r.blockers.length, 3);
});

test('CLI check exits 0 only as consistent + deploy_allowed false; preflight exits nonzero', () => {
 const c = spawnSync(process.execPath, [CLI, 'check', '--ledger', LEDGER], { encoding: 'utf8' });
 assert.equal(c.status, 0, c.stdout + c.stderr);
 const rc = JSON.parse(c.stdout);
 assert.equal(rc.inventory_consistent, true);
 assert.equal(rc.deploy_allowed, false);
 const p = spawnSync(process.execPath, [CLI, 'deployment-preflight', '--ledger', LEDGER], { encoding: 'utf8' });
 assert.notEqual(p.status, 0);
 assert.equal(JSON.parse(p.stdout).deploy_allowed, false);
});

test('CLI requires explicit ledger and rejects override/repair style modes and flags', () => {
 for (const args of [['check'], ['force', '--ledger', LEDGER], ['repair', '--ledger', LEDGER], ['check', '--ledger', LEDGER, '--force'], ['check', '--ledger', LEDGER, '--override', 'x'], ['deployment-preflight', '--ledger']]) {
  assert.equal(spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }).status, 2, args.join(' '));
 }
 assert.equal(spawnSync(process.execPath, [CLI, 'check', '--ledger', '/nonexistent/ledger.json'], { encoding: 'utf8' }).status, 1);
});

test('guard source has no network, process, database or environment access', () => {
 const src = readFileSync(CLI, 'utf8');
 for (const banned of ['process.env', 'node:http', 'node:https', 'node:net', 'node:child_process', 'fetch(', 'writeFile', 'unlinkSync', 'renameSync', 'rmSync']) assert.ok(!src.includes(banned), banned);
});

test('synthetic consistent world with a partial ledger is consistent but blocked', () => {
 const r = evaluate(world());
 assert.deepEqual(r.errors, []);
 assert.equal(r.inventory_consistent, true);
 assert.equal(r.deploy_allowed, false);
});

test('reordered manifest and ledger are fine', () => {
 const w = world({ recorded: ['0001_a.sql', '0002_b.sql'] });
 w.manifest.files.reverse();
 w.ledger.rows.reverse();
 const r = evaluate(w);
 assert.deepEqual(r.errors, []);
 assert.equal(r.inventory_consistent, true);
 assert.equal(r.deploy_allowed, false);
});

test('changed, missing, new and renamed files fail closed', () => {
 let w = world(); w.files.set('0002_b.sql', Buffer.from('-- tampered')); failsWith(w, /content drift.*0002_b/);
 w = world(); w.files.delete('0002_b.sql'); failsWith(w, /missing from migrations directory: 0002_b/);
 w = world(); w.files.set('0003_c.sql', Buffer.from('x')); failsWith(w, /new or renamed.*0003_c/);
 w = world(); w.files.set('0002_renamed.sql', w.files.get('0002_b.sql')); w.files.delete('0002_b.sql');
 failsWith(w, /new or renamed.*0002_renamed/); assert.match(errs(w).join('\n'), /missing.*0002_b/);
 w = world(); failsWith({ ...w, loadErrors: ['unexpected entry in migrations directory: sub'] }, /unexpected entry/);
});

test('added duplicate prefix fails; undeclared or phantom declarations fail', () => {
 let w = world(); w.files.set('0002_other.sql', Buffer.from('x')); failsWith(w, /new or renamed.*0002_other/);
 w = world({ extra: ['0002_other.sql'] }); w.manifest.legacyDuplicatePrefixes = []; failsWith(w, /undeclared duplicate prefix: 0002/);
 w = world(); w.manifest.legacyDuplicatePrefixes = ['0002']; failsWith(w, /no duplicate in inventory: 0002/);
});

test('acknowledged duplicate prefixes still block deployment even if everything else is recorded', () => {
 const w = world({ extra: ['0002_other.sql'], recorded: ['0001_a.sql'] });
 const r = evaluate(w);
 assert.equal(r.inventory_consistent, true);
 assert.equal(r.deploy_allowed, false);
 assert.deepEqual(r.duplicate_prefixes, { '0002': ['0002_b.sql', '0002_other.sql'] });
 const all = world({ extra: ['0002_other.sql'], recorded: ['0001_a.sql', '0002_b.sql', '0002_other.sql'] });
 all.ledger.rows = all.ledger.rows.filter((r, i, rows) => rows.findIndex(x => x.version === r.version) === i);
 failsWith(all, /cannot be recorded_in_ledger under a duplicate prefix/);
});

test('malformed manifest fails closed', () => {
 const bad = [
  [m => { m.files[0].sha256 = 'SUPERVISOR_COMPUTE_SHA256'; }, /sha256 is not 64/],
  [m => { m.files[0].sha256 = m.files[0].sha256.toUpperCase(); }, /sha256 is not 64/],
  [m => { m.files[0].version = '0009'; }, /does not match filename prefix/],
  [m => { m.files[0].status = 'applied'; }, /unknown status/],
  [m => { m.files[0].extra = 1; }, /unexpected key "extra"/],
  [m => { delete m.files[0].sha256; }, /missing key "sha256"/],
  [m => { m.files[1].filename = '0001_a.sql'; m.files[1].version = '0001'; }, /duplicate filename/],
  [m => { m.files[0].filename = '../0001_a.sql'; }, /malformed filename/],
  [m => { m.files = []; }, /non-empty array/],
  [m => { m.files = {}; }, /non-empty array/],
  [m => { m.schemaVersion = 2; }, /schemaVersion/],
  [m => { m.legacyDuplicatePrefixes = ['0002', '0002']; }, /duplicate entries/],
  [m => { m.unknown = true; }, /unexpected key "unknown"/],
 ];
 for (const [mutate, re] of bad) { const w = world(); mutate(w.manifest); failsWith(w, re); }
 failsWith({ ...world(), manifest: [] }, /not an object/);
 failsWith({ ...world(), manifest: null }, /not an object/);
});

test('missing or extra manifest mapping fails', () => {
 let w = world(); w.manifest.files.pop(); failsWith(w, /new or renamed.*0002_b/);
 w = world(); w.manifest.files.push({ filename: '0003_c.sql', version: '0003', sha256: sha('x'), status: 'unverified_legacy' }); failsWith(w, /missing from migrations directory: 0003_c/);
});

test('ledger faults fail closed: duplicate, unknown version, wrong name, malformed, extra keys', () => {
 const bad = [
  [l => l.rows.push({ ...l.rows[0] }), /duplicate ledger version/],
  [l => l.rows.push({ version: '0002', name: 'b' }), /ledger row 0002 matches 0002_b.sql, which the manifest does not mark/],
  [l => l.rows.push({ version: '0099', name: 'zzz' }), /unknown ledger version: 0099/],
  [l => { l.rows[0].name = 'wrong'; }, /ledger name mismatch for version 0001/],
  [l => { l.rows[0].name = 'Bad Name'; }, /malformed name/],
  [l => { l.rows[0].version = '1'; }, /malformed version/],
  [l => { l.rows[0].project_id = 'abc'; }, /unexpected key "project_id"/],
  [l => { l.private = {}; }, /unexpected key "private"/],
  [l => { l.rows = 'x'; }, /rows must be an array/],
  [l => { l.rows = []; }, /recorded but ledger has no matching/],
  [l => { l.rows[0] = null; }, /not an object/],
 ];
 for (const [mutate, re] of bad) { const w = world(); mutate(w.ledger); failsWith(w, re); }
 failsWith({ ...world(), ledger: [] }, /ledger: not an object/);
});

test('arbitrary ledger additions cannot unblock the real manifest', () => {
 const real = { manifest: realManifest(), ...loadMigrations(here + '../../supabase/migrations') };
 const base = json(LEDGER);
 const all = clone(real.manifest).files.filter(f => f.version.length === 4).map(f => ({ version: f.version, name: f.filename.slice(5, -4) }));
 const cases = [
  { ...base, rows: [...base.rows, ...all] },
  { ...base, rows: [...base.rows, { version: '0036', name: 'valuation_roles' }] },
  { ...base, rows: [...base.rows, { version: '20270101000000', name: 'future_release' }] },
 ];
 for (const ledger of cases) { const r = evaluate({ ...real, ledger }); assert.equal(r.inventory_consistent, false); assert.equal(r.deploy_allowed, false); }
 const r = evaluate({ ...real, ledger: { ...base, rows: [] } });
 assert.equal(r.inventory_consistent, false);
});

test('real inventory detects drift in the already-applied file and a new file', () => {
 const real = { manifest: realManifest(), ledger: json(LEDGER), ...loadMigrations(here + '../../supabase/migrations') };
 const drift = new Map(real.files); drift.set(APPLIED, Buffer.concat([drift.get(APPLIED), Buffer.from('\n')]));
 failsWith({ ...real, files: drift }, /content drift/);
 const added = new Map(real.files); added.set('20270101000000_next.sql', Buffer.from('select 1;'));
 failsWith({ ...real, files: added }, /new or renamed/);
});

test('even a fully recorded unique inventory cannot authorize deployment from ledger evidence alone', () => {
 const r = evaluate(world({ recorded: ['0001_a.sql', '0002_b.sql'] }));
 assert.equal(r.inventory_consistent, true);
 assert.equal(r.deploy_allowed, false);
 assert.ok(r.blockers.some(b => b.includes('does not authorize deployment')));
});


test('symlink CLI runs validation and cannot silently pass deployment-preflight', () => {
 const dir = mkdtempSync(join(tmpdir(), 'migration-guard-symlink-'));
 try {
  const link = join(dir, 'guard.mjs');
  symlinkSync(CLI, link);
  const run = args => spawnSync(process.execPath, [link, ...args], { encoding: 'utf8' });
  const check = run(['check', '--ledger', LEDGER]);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).inventory_consistent, true);
  const preflight = run(['deployment-preflight', '--ledger', LEDGER]);
  assert.equal(preflight.status, 1, preflight.stdout + preflight.stderr);
  assert.equal(JSON.parse(preflight.stdout).deploy_allowed, false);
  const missing = run(['check', '--ledger', join(dir, 'missing.json')]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).inventory_consistent, false);
  assert.equal(run(['check']).status, 2);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('importing the guard exposes its functions without executing the CLI', () => {
 const script = `import { evaluate, loadMigrations } from ${JSON.stringify(new URL('./check-migration-baseline.mjs', import.meta.url).href)}; if (typeof evaluate !== 'function' || typeof loadMigrations !== 'function') process.exitCode = 1;`;
 const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 assert.equal(result.stdout, '');
 assert.equal(result.stderr, '');
});
