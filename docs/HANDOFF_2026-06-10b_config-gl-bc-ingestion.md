# Session Handoff — 2026-06-10 (b): real config, QBO GL, BC categories, ingestion log

Pick up from here. This continues the portal + payables/bookkeeper work. The
previous handoff was `HANDOFF_2026-06-10_portal-and-payables-travel-ux.md`.

---

## TL;DR of what shipped this session

1. **Dedup (payables ingestion).** `agents/payables/core/ingest_processor.py` now
   skips re-uploads by `doc_hash` (sha256 of file) and the *same invoice* from a
   different file/channel by `dedupe_key` (`vendor-first-word|amount|date`).
   Migration `0011_payables_dedup.sql`.
2. **Real config in the coding drawer.** Pay-from = real **payment_methods**
   (active only — **Wells Fargo is `closed`/archived → excluded**, last-4 shown).
   GL dropdowns are **filtered by the line's entity**. Per-line entity so one QB
   invoice can **split across entities**; **Combine into 1 line**.
   `"Always code this vendor"` persists via `/api/vendor-rule` → `vendor_rules`
   table, which the processor reads as an override (`_apply_vendor_rule`).
3. **GL master KILLED.** Chart of accounts now comes **LIVE from the QBO API**
   (7 realms, ~1085 accounts) into Supabase `gl_accounts`. Deleted
   `data/config/shared/general_ledger_master.json` + `agents/bookkeeper/core/gl_import.py`.
   `shared/config_loader.load_general_ledger_master()` now reads Supabase and
   returns the same nested shape, so `coding.py`/`gl_coder.py`/`prompt_builder.py`
   are unchanged. **Readiness gate 15/15.**
4. **BC expense-category capture.** BC lines show the fixed PER-QB route
   (`Loan - Builders Capital`) **and** a **Paylocity category** dropdown (25
   categories from `bc_expense_config.json` → `bc_categories` table). For the BC
   reimbursement report. Migration `0013` (+ `payables_queue.bc_category`).
5. **Ingestion log / error report.** New "Ingestion log" tab in Payables surfaces
   every document and its outcome — **filed / duplicate / error / pending** — so
   nothing is blind-excluded. Errors get a **↻ Reprocess** button
   (`/api/ingest/reprocess` resets the job to pending). `lib/data/ingestion.ts`.

All committed + pushed: agent-portal `main`, agent-system `portal/operator-bridge`.

---

## Architecture state (important, locked)

- **ONE Supabase project**: `agent-portal` (ref `zhaniufkcwlnmjiszrip`). Everything
  the portal reads lives here. `.env` `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
  `SUPABASE_DB_URL` all point here. The second project is deleted. Don't recreate.
- **`STATE_BACKEND=json`** in `.env` (rolled back from `remote`; the new project has
  no `shared.*` state schema, and RemoteStore is still a skeleton). The payables
  processor talks to Supabase **directly via psycopg / `SUPABASE_DB_URL`**, not the
  state seam — so it's unaffected.
- **QBO OAuth is LIVE**: 7 realms with valid tokens in
  `data/state/shared/qbo_tokens.json` (FC/PER/WJW/WB12/IOTA/PC/SEL). Realm IDs in
  `.env` (`QBO_REALM_*`). `agents/bookkeeper/core/qbo_sync.py` `_qbo_query` works.
- **Dropbox API** is wired (`shared/dropbox/dropbox_api.py`), writing to `/Finance`.
- **`.env` holds secrets** (Dropbox refresh token, Supabase DB password, QBO
  client secret). **Never commit it** (gitignored; the commit guard enforces this).

### Supabase tables now in use by the portal
`payables_queue` (+ `doc_hash`, `dedupe_key`, `bc_category`), `payment_methods`,
`gl_accounts`, `bc_categories`, `vendor_rules`, `ingestion_jobs`, plus the agent
read tables (`agent_health`, `operator_actions`, `review_queue`, `profiles`,
`trips`, `travel_queue`, `bookkeeper_ledger`, `bc_reimbursement`).

### Re-sync config any time (idempotent)
```bash
cd ~/Projects/agent-system
.venv/bin/python -m agents.payables.diagnostics.sync_config_to_supabase
# pushes payment_methods (19) + gl_accounts (live from QBO, ~1085) + bc_categories (25)
```

### The ingestion processor loop (currently runs on THIS machine — ephemeral)
```bash
.venv/bin/python -m agents.payables.core.ingest_processor --loop --interval 30
# single file: --file /path/to/invoice.pdf
```
**It is NOT yet on launchd/Azure** — see open work.

---

## Open / next work (priority order)

1. **Persist the drawer on Confirm.** The coding drawer is interactive but
   "Confirm & post" only updates local React state + toasts. It does **not** write
   the chosen entity / GL / pay-from / `bc_category` / line splits back to
   `payables_queue`, and does not post to QBO. Wire a `/api/payables/[id]` PATCH
   (or a Supabase update) so operator coding sticks, then the batch "post to QBO"
   checkpoint. This is the gateway to real posting.
2. **Actually post to QuickBooks** via the QBO OAuth API (the real Phase). Use
   `qbo_sync` auth + a payload builder (`agents/bookkeeper/core/payload_builder.py`,
   `post_runner.py`). Transaction types per CLAUDE.md (Purchase/Bill/Deposit/Check,
   never JournalEntry). Two-QB intercompany for non-PER entities. Auto-approved
   items = one-click **batch checkpoint**.
3. **Processor: auto-capture `bc_category`** for auto-coded BC items (currently
   left null; operator sets it in the drawer). Map BC expense → Paylocity category
   from invoice content / vendor.
4. **Card maintenance Admin screen** (Jacob's note 3): edit
   `payment_methods.active_last_four` / status when cards change. Data already lives
   in Supabase `payment_methods`; just needs an admin UI (portal `admin` module) +
   a write route. QB lacks debit/checking card numbers, so this stays operator-maintained.
5. **Clean up dead QBO→JSON path.** `qbo_sync.sync_chart_of_accounts` /
   `sync_all_entities` still try to write the deleted `general_ledger_master.json`.
   Either repoint them to Supabase `gl_accounts` or delete them (the live GL sync is
   `sync_config_to_supabase.sync_gl_accounts`). `qbo_zapier.py` is also retired.
6. **Always-on processor.** Move the ingest loop to launchd (MacMini) or Azure so
   uploads process without a terminal open. Heartbeat to the portal.
7. **Check Supabase egress.** Earlier it was way over the 5GB free cap (~63GB) from
   the two-project mistake + tight polling. Confirm it's back down (Reports → Egress).
8. **3 stale errored ingestion jobs** exist (old `shared.state_documents` failures,
   now fixed). They're visible in the new Ingestion log — Reprocess them or leave;
   dedup will skip if they duplicate the 5 good rows.

---

## Standing rules (don't drift)
- No file changes without scope approval; dry-run by default.
- Calendar Writer V2 and Contact Agent are LOCKED.
- Give clickable review links after each run.
- Wells Fargo is archived; GL accounts are by entity; QBO is the GL source of truth.

## Key files
- Backend: `agents/payables/core/ingest_processor.py`,
  `agents/payables/diagnostics/sync_config_to_supabase.py`,
  `shared/config_loader.py` (GL loader), `agents/bookkeeper/core/qbo_sync.py`.
- Portal: `components/payables/Payables.tsx`, `lib/data/{config,payables,ingestion}.ts`,
  `app/api/{ingest,vendor-rule,ingest/reprocess}/route.ts`,
  `supabase/migrations/0011..0013`.
