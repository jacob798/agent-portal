state: ready-for-proof
review_package: prepared 2026-10-30; no live writes performed
next: Jacob reviews Deals docs/proofs/deals_workspace_v1.0.0_review.md and explicitly authorizes migration-only merges Deals #3 / agent-portal #8
retention: OPEN; environment proof; production blocked
local_validation: six migration rehearsal/rollback/apply/replay; 209 reference/history rows; 20 grants; unprivileged runtime; 35 runner tests; 4 deployment tests; Gunicorn config startup
live_preflight: passed read-only 2026-10-30; exact six pending, no existing review login/secrets
full_contract_proof: unexecuted; individual live sessions and 87-case proof remain execution work
implementation_prs: deals #1; agent-portal #7; shared-services #105 (not authorized to merge)
migration_prs: deals #3; agent-portal #8 (await explicit merge authorization)
tracking: https://app.asana.com/0/1219550478041719/1219895902059706
