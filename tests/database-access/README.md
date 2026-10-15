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

## Scope

Backend-first. No UI redesign, production merge, subscription purchase, workflow activation, or QuickBooks posting. Existing worker `service_role` grants are retained. The new private no-argument authorization helper returns only the caller's admin flag, with fixed empty search path, explicit authenticated EXECUTE, and no exposed-schema registration.
