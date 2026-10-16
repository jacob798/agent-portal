# Database access verification

Run `npm ci --prefix tests/database-access`, then `node tests/database-access/run.mjs` from the repository root. PGlite 0.5.10 is pinned in this isolated test package; it is not an application dependency. No network/database credentials or real customer fixtures are used at runtime.

The fixture represents the current policy names and grants with minimal synthetic tables. It tests real PostgreSQL RLS enforcement for admin, ungranted, every mapped module, and Travel's trip-linked payable scope; browser write denial, anonymous denial, worker writes and empty identity denial. Temporary test grants roll back. It does not recreate full production schema, Supabase Auth/Storage, API routes or the Azure worker. Passing this suite does not authorize applying the proposal to production.

## Deployment state

- `supabase/migrations/20261015191718_foundry_restrict_public_data_access.sql` records the DDL already applied on October 15. Its migration version was read from the live migration ledger. Customer-specific verification queries are deliberately excluded.
- `supabase/proposals/20261015201030_foundry_scope_legacy_module_access.sql` is **NOT APPLIED**. The timestamp was generated using `supabase migration new`; the file was then moved out of the runnable migrations directory. It must remain a proposal until staging rehearsal and production change review pass.
- Automatic approval review rejected the live follow-up migration because its broad permission changes had not been rehearsed against an isolated matching environment. No retry or alternate live execution was attempted.
- Merging this PR must not automatically deploy database changes. Production application code is unchanged.

## Required before live application

1. Inventory all database callers, including Azure worker, scripts and n8n. Confirm any authenticated-role writes have an authorized server-side replacement. Portal upload already uses a guarded server route/service client; that alone does not verify every external caller.
2. Rehearse on an isolated matching schema with synthetic data and unchanged production credentials. Verify admin and each module role through the actual portal/API, upload, worker and view paths. Test signup/invitations because function execution grants change.
3. Capture current ACLs, policies, function settings and default privileges; prepare and test a complete rollback. The historical local rollback snapshot is not a certified restoration plan.
4. Approve the exact staged change, then apply a migration with atomic assertions and a short lock timeout; verify advisors and live read-only portal paths immediately. Abort on failed assertions or lock timeout.
5. Record actual applied version and evidence in the Phase 0 access task. Do not mark Phase 0 complete before these checks pass.

## Source-control migration caution

Legacy files use duplicate numeric prefixes and the live migration ledger does not contain all historical files. Do not run an unrestricted `supabase db push` against production. Reconcile the historical baseline and migration ledger in isolation first; do not mark historical files applied merely to suppress differences. This PR preserves history and records the already-applied fix; it does not resolve the legacy baseline automatically.

## Migration baseline guard (offline, read-only)

`check-migration-baseline.mjs` uses Node builtins only (no install, network, database or environment-credential reads). It compares three explicit inputs: `migration-baseline.json` (immutable filename/version/SHA-256 inventory of all 46 files in `supabase/migrations`), `fixtures/observed-ledger.json` (live ledger snapshot, version and name only; no project IDs, ACLs or customer data) and the migrations directory.

```
node --test tests/database-access/migration-baseline.test.mjs
node tests/database-access/check-migration-baseline.mjs check --ledger tests/database-access/fixtures/observed-ledger.json
node tests/database-access/check-migration-baseline.mjs deployment-preflight --ledger tests/database-access/fixtures/observed-ledger.json   # exits 1 today
```

- Fails closed (exit 1) on changed, missing, new or renamed SQL files; undeclared or phantom duplicate prefixes; malformed manifest or ledger (including extra keys); duplicate ledger versions; unknown ledger versions; wrong names; and ledger rows the manifest does not already mark recorded. Exit 2 is a usage error. There are no override, force or repair modes, and nothing is written or generated.
- `check` exits 0 only when the inventory is consistent, and prints `inventory_consistent` and `deploy_allowed` explicitly. `deployment-preflight` always exits nonzero: inventory/ledger evidence alone cannot authorize deployment, even for a fully recorded unique inventory.
- Current state: inventory-consistent, `deploy_allowed: false`. Only `20261015191718_foundry_restrict_public_data_access.sql` is `recorded_in_ledger` (live version/name match, and its digest equals the retained applied SQL). The other 45 files are `unverified_legacy`: unknown whether applied, unreconciled. Duplicate prefixes 0008, 0013–0019 and 0031 are acknowledged but never treated as safe to replay.
- A recorded ledger row is version/name evidence only. It does not prove whole-schema or DDL equivalence, and the ACL snapshot must not be read as such. Adding ledger rows cannot unblock deployment; statuses change only through a reviewed edit of the manifest, which also needs matching file digests.

Scope, honestly: this is a CI check that the inventory has not drifted and a preflight that reports BLOCKED. There is no existing deploy pipeline and nothing here is wired to an actual `db push`; it does not reconcile or authorize any schema change.

## Scope

Backend-first. No UI redesign, production merge, subscription purchase, workflow activation, or QuickBooks posting. Existing worker `service_role` grants are retained. The new private no-argument authorization helper returns only the caller's admin flag, with fixed empty search path, explicit authenticated EXECUTE, and no exposed-schema registration.
