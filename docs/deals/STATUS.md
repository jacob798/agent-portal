## Portal bridge v1.0.3 — unreleased 2026-11-01

Required pilot completion fix: provider budget30s/backend worker40s must complete before bridge45s deadline, avoiding premature unknown outcomes. No retries or credential/access changes. Explicit HTTP409 provider_conflict bodies pass unchanged to the UI. Seven local bridge checks pass including deadline and conflict propagation. Branch codex/deals-workspace-v1.0.0/draftPR7 remains unmerged and undeployed; real-session proof pending.

state: needs-jacob
next: approve migrations_contract v1.3.1 at a2015ada before runner implementation
executed: ACR cac6 succeeded; provisioning stopped at bootstrap_password_missing_or_invalid
verified: pooler drops PGOPTIONS; transaction-local non-secret read-only probe passes and resets
live_state: no Deals DB/vault/host activation; previous 47 ledger rows unchanged; no merges
retention: OPEN; production blocked
tasks: 1219895902059706, 1219983346005726, 1220023756136865, 1220024032740026, 1220079934048682, 1220079963987559 remain open
