// Offline, read-only migration inventory / ledger reconciliation guard.
// Node builtins only. No network, database, or environment-credential access.
// It never repairs, marks, renames or generates anything; it only reports.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HEX64 = /^[0-9a-f]{64}$/;
const FILE = /^(\d{4}|\d{14})_[a-z0-9_]+\.sql$/;
const VERSION = /^(\d{4}|\d{14})$/;
const NAME = /^[a-z0-9_]+$/;
const RECORDED = 'recorded_in_ledger';
const LEGACY = 'unverified_legacy';
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, k);
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

function exactKeys(o, keys, label, errors) {
 for (const k of Object.keys(o)) if (!keys.includes(k)) errors.push(`${label}: unexpected key "${k}"`);
 for (const k of keys) if (!has(o, k)) errors.push(`${label}: missing key "${k}"`);
}

function parseManifest(m) {
 const errors = [], entries = [];
 if (!isObj(m)) return { errors: ['manifest: not an object'], entries, declaredDuplicates: [] };
 exactKeys(m, ['schemaVersion', 'description', 'legacyDuplicatePrefixes', 'files'], 'manifest', errors);
 if (m.schemaVersion !== 1) errors.push('manifest: schemaVersion must be 1');
 if (typeof m.description !== 'string') errors.push('manifest: description must be a string');
 let declaredDuplicates = [];
 if (!Array.isArray(m.legacyDuplicatePrefixes)) errors.push('manifest: legacyDuplicatePrefixes must be an array');
 else {
  declaredDuplicates = m.legacyDuplicatePrefixes;
  for (const p of declaredDuplicates) if (typeof p !== 'string' || !VERSION.test(p)) errors.push(`manifest: malformed duplicate prefix ${JSON.stringify(p)}`);
  if (new Set(declaredDuplicates).size !== declaredDuplicates.length) errors.push('manifest: duplicate entries in legacyDuplicatePrefixes');
 }
 if (!Array.isArray(m.files) || m.files.length === 0) { errors.push('manifest: files must be a non-empty array'); return { errors, entries, declaredDuplicates }; }
 const seen = new Set();
 m.files.forEach((f, i) => {
  const label = `manifest.files[${i}]`;
  if (!isObj(f)) return errors.push(`${label}: not an object`);
  exactKeys(f, ['filename', 'version', 'sha256', 'status'], label, errors);
  if (typeof f.filename !== 'string' || !FILE.test(f.filename)) return errors.push(`${label}: malformed filename ${JSON.stringify(f.filename)}`);
  const version = f.filename.split('_')[0];
  if (f.version !== version) errors.push(`${label}: version ${JSON.stringify(f.version)} does not match filename prefix ${version}`);
  if (typeof f.sha256 !== 'string' || !HEX64.test(f.sha256)) errors.push(`${label}: sha256 is not 64 lowercase hex characters (${f.filename})`);
  if (f.status !== RECORDED && f.status !== LEGACY) errors.push(`${label}: unknown status ${JSON.stringify(f.status)}`);
  if (seen.has(f.filename)) errors.push(`${label}: duplicate filename ${f.filename}`);
  seen.add(f.filename);
  entries.push({ filename: f.filename, version, name: f.filename.slice(version.length + 1, -4), sha256: f.sha256, status: f.status });
 });
 return { errors, entries, declaredDuplicates };
}

function parseLedger(l) {
 const errors = [], rows = [];
 if (!isObj(l)) return { errors: ['ledger: not an object'], rows };
 exactKeys(l, ['schemaVersion', 'source', 'rows'], 'ledger', errors);
 if (l.schemaVersion !== 1) errors.push('ledger: schemaVersion must be 1');
 if (typeof l.source !== 'string') errors.push('ledger: source must be a string');
 if (!Array.isArray(l.rows)) { errors.push('ledger: rows must be an array'); return { errors, rows }; }
 const versions = new Set();
 l.rows.forEach((r, i) => {
  const label = `ledger.rows[${i}]`;
  if (!isObj(r)) return errors.push(`${label}: not an object`);
  exactKeys(r, ['version', 'name'], label, errors);
  if (typeof r.version !== 'string' || !VERSION.test(r.version)) return errors.push(`${label}: malformed version ${JSON.stringify(r.version)}`);
  if (typeof r.name !== 'string' || !NAME.test(r.name)) return errors.push(`${label}: malformed name ${JSON.stringify(r.name)}`);
  if (versions.has(r.version)) errors.push(`${label}: duplicate ledger version ${r.version}`);
  versions.add(r.version);
  rows.push({ version: r.version, name: r.name });
 });
 return { errors, rows };
}

// files: Map<filename, Buffer> of the migrations directory; loadErrors: problems found while listing it.
export function evaluate({ manifest, ledger, files, loadErrors = [] }) {
 const mf = parseManifest(manifest), lg = parseLedger(ledger);
 const errors = [...loadErrors, ...mf.errors, ...lg.errors];
 const report = {
  inventory_consistent: false,
  deploy_allowed: false,
  file_count: files.size,
  errors,
  blockers: [],
  duplicate_prefixes: {},
  recorded_in_ledger: [],
  unverified_legacy: [],
  notes: [
   'Ledger evidence covers version+name only. It does not prove schema or DDL equivalence for any file, including recorded ones.',
   'Unverified legacy files are UNKNOWN: they may or may not have been applied. Nothing here marks them applied.',
   'Declared duplicate prefixes are acknowledged, never treated as safe to replay.',
  ],
 };
 if (mf.errors.length || lg.errors.length) { errors.sort(); return report; }

 const byName = new Map(mf.entries.map(e => [e.filename, e]));
 for (const name of files.keys()) if (!byName.has(name)) errors.push(`new or renamed migration file not in manifest: ${name}`);
 for (const e of mf.entries) {
  if (!files.has(e.filename)) errors.push(`manifest file missing from migrations directory: ${e.filename}`);
  else if (sha256(files.get(e.filename)) !== e.sha256) errors.push(`content drift (sha256 mismatch): ${e.filename}`);
 }

 const groups = {};
 for (const e of mf.entries) (groups[e.version] ??= []).push(e.filename);
 for (const [v, names] of Object.entries(groups)) if (names.length > 1) report.duplicate_prefixes[v] = names.sort();
 const actualDup = Object.keys(report.duplicate_prefixes).sort(), declaredDup = [...mf.declaredDuplicates].sort();
 for (const v of actualDup) if (!declaredDup.includes(v)) errors.push(`undeclared duplicate prefix: ${v}`);
 for (const v of declaredDup) if (!actualDup.includes(v)) errors.push(`declared duplicate prefix has no duplicate in inventory: ${v}`);

 for (const e of mf.entries) {
  if (e.status === RECORDED && groups[e.version].length > 1) errors.push(`${e.filename}: cannot be recorded_in_ledger under a duplicate prefix (ledger is keyed by version)`);
  if (e.status === RECORDED && !lg.rows.some(r => r.version === e.version && r.name === e.name)) errors.push(`manifest marks ${e.filename} recorded but ledger has no matching version+name row`);
 }
 for (const r of lg.rows) {
  const sameVersion = mf.entries.filter(e => e.version === r.version);
  if (!sameVersion.length) { errors.push(`unknown ledger version: ${r.version}`); continue; }
  const match = sameVersion.find(e => e.name === r.name);
  if (!match) errors.push(`ledger name mismatch for version ${r.version}: ${r.name}`);
  else if (match.status !== RECORDED) errors.push(`ledger row ${r.version} matches ${match.filename}, which the manifest does not mark recorded_in_ledger; ledger rows cannot self-authorize`);
 }

 report.recorded_in_ledger = mf.entries.filter(e => e.status === RECORDED).map(e => e.filename).sort();
 report.unverified_legacy = mf.entries.filter(e => e.status === LEGACY).map(e => e.filename).sort();
 errors.sort();
 report.inventory_consistent = errors.length === 0;
 if (report.inventory_consistent) {
  if (report.unverified_legacy.length) report.blockers.push(`${report.unverified_legacy.length} migration file(s) are unverified legacy: application state unknown/unreconciled`);
  if (actualDup.length) report.blockers.push(`duplicate migration prefixes unreconciled: ${actualDup.join(', ')}`);
  report.blockers.push('offline ledger/inventory evidence does not authorize deployment or prove schema equivalence');
  report.deploy_allowed = false;
 }
 return report;
}

export function loadMigrations(dir) {
 const files = new Map(), loadErrors = [];
 for (const d of readdirSync(dir, { withFileTypes: true })) {
  if (d.isFile() && d.name.endsWith('.sql')) files.set(d.name, readFileSync(join(dir, d.name)));
  else loadErrors.push(`unexpected entry in migrations directory: ${d.name}`);
 }
 return { files, loadErrors };
}

function main(argv) {
 const [mode, ...rest] = argv;
 const opts = {};
 for (let i = 0; i < rest.length; i += 2) {
  const k = rest[i];
  if (!['--ledger', '--manifest', '--migrations-dir'].includes(k) || rest[i + 1] === undefined || has(opts, k)) return usage();
  opts[k] = rest[i + 1];
 }
 if (!['check', 'deployment-preflight'].includes(mode) || !opts['--ledger']) return usage();
 const here = fileURLToPath(new URL('.', import.meta.url));
 let report;
 try {
  const manifest = JSON.parse(readFileSync(opts['--manifest'] ?? join(here, 'migration-baseline.json'), 'utf8'));
  const ledger = JSON.parse(readFileSync(opts['--ledger'], 'utf8'));
  report = evaluate({ manifest, ledger, ...loadMigrations(opts['--migrations-dir'] ?? join(here, '../../supabase/migrations')) });
 } catch (e) {
  report = { inventory_consistent: false, deploy_allowed: false, errors: [`unreadable input: ${e.message}`], blockers: [] };
 }
 report.mode = mode;
 console.log(JSON.stringify(report, null, 1));
 if (!report.inventory_consistent) return 1;
 return mode === 'deployment-preflight' && !report.deploy_allowed ? 1 : 0;
}

function usage() {
 console.error('usage: check-migration-baseline.mjs <check|deployment-preflight> --ledger <observed-ledger.json> [--manifest <file>] [--migrations-dir <dir>]');
 return 2;
}

// Node resolves the module URL through symlinks, while argv retains the invoked path.
// Compare canonical files so a symlink cannot skip the CLI guard and exit successfully.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2));
