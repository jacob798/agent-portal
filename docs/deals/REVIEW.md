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
