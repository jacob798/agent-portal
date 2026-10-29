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
