# Deals portal bridge v1.0.0 — implementation draft, 2026-10-28

Reuse existing Azure/Supabase sign-in; add explicitly authorized account/project
navigation and server-only session forwarding with origin, path, size and redirect
checks. Propose portal-owned capability view without default grants. Five bridge
checks, TypeScript and Next build pass locally. Live activation/proof pending;
no merge/deployment, new permission inheritance or retention decision.


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

Binding documentation v1.0.1: review scope approved; migration runner extension
required before live binding (Deals docs/proposals/MIGRATIONS_CONTRACT_V1_3_0.md;
Asana 1220023756136865). No portal runtime behavior changed in this pass.
