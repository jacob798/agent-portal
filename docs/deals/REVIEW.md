# Deals portal binding — review candidate, 2026-10-28

Base portal: a2e24df928d08df9b9a496b069b38046d8b1a079. Uses its existing Azure
Supabase sign-in/callback and server cookie client. No new login provider.
Authority: Deals seven-contract approval f6039f5 and Jacob's request to reuse Azure
sign-in and connect project permissions. No new role inheritance.

`/deals` reads the authenticated user's own capability rows; the account route
forwards that verified session to a fixed HTTPS Deals backend. The backend verifies
identity/session and current scoped capabilities again. Browser actor headers,
portal admin role and create-project permission never imply project access.

Runtime settings: DEALS_WORKSPACE_URL (fixed HTTPS backend), DEALS_PORTAL_ORIGIN
(exact portal origin). Backend secrets remain Key Vault references. The navigation
registry has no default Deals roles. Configure module visibility separately from
project authority; neither is inferred from the other.

permission-binding.sql is a proposed authorization-owner migration fragment, not
an applied migration. No identities/grants are seeded. It needs the shared-services
migration reservation/runner and an explicit read-only processor role policy. No
live migration, deployment or grant expansion is included in this PR execution.

Local validation: five bridge checks, TypeScript and Next production build passed.
No real Microsoft browser sign-in or live revocation test has occurred. Dependencies
retain the repository lockfile; no framework upgrade. Retention is deferred and
Deals production activation remains blocked. See Deals PR #1 and its review guide.

Open: Approved Jacob-only review scope installation, backend host and dedicated credentials,
reviewed migration/proof/deploy runbook, then real-session integration evidence.


### Review access approved — 2026-10-29

Jacob replied **"yes"** to: "Should Jacob’s existing portal account receive create
access for the review account and view/edit/review access only to review projects?"
This approves that narrow scope. It grants neither reference stewardship nor access
to other users, other accounts or unrelated projects. Grant installation remains
with the existing authorization owner; the application cannot assign permissions.
The explicit nonproduction IDs are in the Deals repository’s deploy/review-access.json; they are deployment
bindings, never application defaults. They have not been provisioned or granted.
Retention remains deferred. This is not approval to merge either PR, deploy a host
or execute the draft proof runbook. No access-scope reconfirmation is needed.


### Review activation preparation — 2026-10-29
All five approved users matched to existing Azure/Supabase subjects via read-only
lookup. Deals deploy/team-identities.json records exact bindings. Initial review
grants are prepared for all five (20 rows), excluding reference administration;
no live grants installed. Migration reservations 0067 portal capabilities, 0068
Deals schema, 0069 runtime permissions follow an inventory of 36 refs. The exact
files passed isolated PostgreSQL rehearsal/rollback/apply/replay and ledger checks.
Team grant replay/revocation checks passed locally. These are not live proofs.
See Deals deploy/REVIEW_ACTIVATION.md for remaining seed, future-project grant
provisioning, secret-safe provisioning and runtime packaging gaps. Retention OPEN.


### Activation package v1.0.1 — 2026-10-30
Implements the existing approvals without new business classifications or grants:
209 reference rows preserve seed UUIDs, ordinary-label meanings and contract
qualifiers, with immutable revision-one history. All five approved users receive
20 explicit initial-review grants. Later projects use the authorization owner's
prepare_project_access helper and reserved migration process; capture still shows
access pending until explicit grants are installed. Revoked/timed grants are never
reactivated by preparation/replay. No reference-administrator grant is added.

Reserved activation files 0070 seed, 0071 dedicated login, 0072 initial team grants
follow 0067–0069. Login password is generated in memory, stored only in Key Vault,
and supplied to the migration session without embedding it in SQL files/logs.
Existing login/secrets or unexpected pending migrations stop provisioning; partial
failures preserve vault/ledger state and require recovery review, never blind retry.

Prepared a non-root pinned-base container, locked dependencies, scoped managed
identity/hosting commands, ingress-disable rollback and exact preview bindings.
Live execution awaits the completed runbook approval. Full six-migration rehearsal,
rollback/apply/replay passed locally; 209 catalog/history rows, 20 grants and runtime
privilege checks passed. Four deployment regression tests and Gunicorn startup
configuration check passed. No live execution, merge or retention selection.


2026-10-30 review package complete: pinned code checkouts and migration hashes,
exact resource/secret/preview bindings, build/provision/host/test/rollback steps
are in Deals docs/proofs/deals_workspace_v1.0.0_review.md. Read-only live preflight
passed (no history blockers, exact six pending, no existing review login/secrets).
Separate migration-only reviews Deals #3 and portal #8 await explicit merge approval.
Runbook is not executed or approved; full live contract proof remains pending.
Retention deferred; no production rollout or implementation PR merge claimed.


### Approved execution stopped; migration-number correction — 2026-10-30
Jacob approved runbook f84d47f and migration-only merges (#3/#8), recorded at
1510a1f. Fresh preflight stopped before any write: Travel 0067 is now applied
live; shared-services PR #109 reserves Save 0068. Approved pinned Travel history
therefore lacks a newly applied file. All pinned checkouts themselves were clean.
Renumber the six UNAPPLIED Deals/portal files to 0073–0078 in unchanged relative
order; SQL content and SHA-256 checksums are identical. Update Travel history pin
to include live 0067. This is a deployment-input correction, no new business rule.
The prior approval is preserved; execution does not resume until the revised
runbook inputs are approved. No build, credential, database, grant, deploy or merge
step ran. Retention remains deferred.


### Review deployment session binding fix — v1.0.2, 2026-10-30
Approved runbook 3b11789 (Jacob: "approved") built ACR run cac5 successfully. Provisioning then stopped; live inspection confirmed zero Deals ledger rows/tables/roles and no review vault secrets. Read-only inspection shows postgres can SELECT/grant SELECT on auth.sessions but is not its owner. Local reproduction: `must be owner of table sessions`. The script suppressed the original child error, so this is a reproduced blocking defect, not a recovered original error trace.

Implementation candidate replaces direct auth.sessions access/policy creation with authorization-owner `public.portal_deals_sessions`, exposing exactly id UUID, user_id UUID, not_after timestamptz nullable. The existing migration operator owns the view; security_invoker=false is intentional, security_barrier=true, all PUBLIC/anon/authenticated/service_role grants revoked, SELECT only to deals_workspace_runtime. No base-table ownership/policy/grant changes, token columns, writes or additional end-user grants. The adapter retains exact verified actor/session and current-expiry checks on every request, fails closed, and caches nothing. This is a physical binding correction under section 7; the seven approved business contracts and retention deferral remain unchanged.

Seven local permission regressions pass with a non-superuser/non-auth-owner migration operator. Separate local checks prove active/wrong actor/missing/expired/revoked sessions, no tokens/writes/client access, and unchanged managed owner/policies. Twelve identity/deployment tests pass; seven unrelated DB grant tests were skipped in that invocation. No live replay, host activation or merge occurred. Revised source/migration hashes require recovery-runbook approval before writes resume.


### Recovery execution stopped; verified bootstrap cause — 2026-10-30
Jacob approved recovery 50759fb with "approvaing", recorded 4830b36. ACR run cac6 succeeded (36s), image sha256:f18965bb44da11b95e25b6b8cece33b567916eadada25fd87cbfe42656aad15a. Provisioning stopped again; no Deals ledger rows/tables/roles or review secrets persisted, and the prior 47-row ledger fingerprint stayed 75d46c7e69366a47f4ff92cb932c321f. No host/portal activation or merge.

Server logs now establish the cause of BOTH attempts: bootstrap_password_missing_or_invalid (P0001), at 03:43:56.448Z and 03:53:09.163Z October 31 UTC (October 30 locally). This supersedes the earlier inferred explanation: the managed-auth ownership finding was reproduced locally but was NOT the observed live failure. Existing pooler drops the bootstrap PGOPTIONS setting; direct IPv6 endpoint is unavailable from this runner. A non-secret read-only transaction probe proves parameterized transaction-local set_config works and resets on rollback.

Required draft dependency: migrations_contract v1.3.1 at shared-services a2015ada5662198c9868cc2a1ddf97db51e5f409, branch codex/migrations-v1.3.1, task 1220079963987559. Bounded settings on stdin, logging guards and sanitized error stages; no runner implementation before named approval. No new business fields, grants, credential store or retention policy. Recovery remains stopped; existing runtime image preserved, not deployed.
