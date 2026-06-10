# Session Handoff — Agent Portal + Payables/Travel UX (2026-06-10)

Pick-up notes for the next session. Two repos: `agent-portal` (Next.js frontend) and
`agent-system` (Python backend). Portal is **live**.

## ✅ What's done and deployed
- **Agent Portal** live at **https://agents.foundry-capital.co** (Vercel + Supabase).
  Next.js 16 / App Router / TS / Tailwind v4. Foundry-branded (real logo, navy/blue, Poppins).
- **Auth:** Microsoft SSO (Supabase Auth + Entra). Roles `admin`/`operator`/`viewer`,
  owner bootstrap via `PORTAL_OWNER_EMAILS`. Jacob signs in fine (admin).
- **Surfaces:** Dashboard (agent health), **Inbox** (the single review surface — Review Queue
  consolidated into it; `/review-queue` redirects to `/inbox`), Admin (user mgmt).
  Inbox renders approval/choice/input/alert + a **source-document side panel** (embedded PDF).
- **Operator-action bridge** (`agent-system/shared/operator/`): agents call
  `request_human_action()` → bridge writes Supabase `operator_actions` → portal Inbox → operator
  decides → bridge polls back via `record_human_response()`. Run: `python -m shared.operator --loop`.
  Orchestrator auto-syncs each cycle. Bridge id == agent action_id (no map table).
- **Real LLM data pipeline WORKS:** Graph mailbox (creds in `.env`) → OpenAI (gpt-5.5, incl.
  PDF **vision**) → classify → portal. Proven: an invoice PDF extracted vendor+amount+entity.
- **Supabase schema** applied: `agent_health`, `review_queue`, `operator_actions`, `profiles`
  (+ trigger, RLS). Connect via libpq pooler `aws-1-us-west-2.pooler.supabase.com`.
- **Docs + memory** are now **portal-first** (CLAUDE.md updated; Teams retired; Azure not MacMini).

## 🔑 Two fixes that unblocked real PDF extraction (committed on `portal/operator-bridge`)
1. `.env`: **`ALLOW_FULL_PARSER_MULTIMODAL_FALLBACK=true`** → PDFs render to images for vision.
2. `shared/path_utils.resolve_local_document_path()` → resolves doc paths across environments
   (Azure `/app/...` vs local `/Users/...`), wired into PDF render + payables text read.
   **For Azure prod: set the env flag there too.**

## ⚠️ Open backend items
- **Branch not merged:** all bridge/fix work is on `agent-system` branch **`portal/operator-bridge`**.
  Not merged into `valuation/phase-1` — blocked by (a) it's checked out in another worktree
  (`/private/tmp/val-phase1`) and (b) a conflict in `agents/valuation/state/repository.py`. Needs
  Jacob's coordination.
- **Action store has duplicate cruft** from test reprocesses (portal Inbox was deduped manually;
  the underlying store should get a one-time cleanup).
- Gate stays 15/15 (`python -m agents.travel.diagnostics.invoice_routing_readiness`).

## 🎨 The mockups (THIS is the active design work)
Two clickable HTML mockups in **`agent-portal/docs/mockups/`** (open via `file://` path):
- `payables_exceptions.html` — Payables exception queue
- `travel_exceptions.html` — Travel (multi-view: sidebar nav, expense queue, Trips list, trip detail)

### Design decisions baked into the mockups (Jacob-approved)
- **Exceptions-only:** operator only touches what the agent can't resolve confidently. Known
  patterns auto-process. Each decision can be made **permanent** ("Always code X → BC" → writes a
  vendor_master rule; never asked again).
- **One-click, inline from the queue** (no multi-screen drill-in); detail drawer for the full view.
- **Payables:** Bill vs Charge + payment account per row. Intake = **two buttons**: "Get
  transactions from Plaid" + "Upload CSV/QBO" (modal: pick Account + Entity, both from QB).
  A **🧳 Travel** button on every row reclassifies a charge to a trip (inline trip-pick OR
  "let Travel suggest").
- **Travel:** receipts arrive one-at-a-time at `invoices@foundry-capital.co` (snap a photo / forward).
  Agent **suggests** the trip on arrival (date window + travel category + **📍location**); operator
  **batch-confirms** ("Confirm all"). Home-location meal during trip dates → **not a trip → Payables**.
  Post-trip invoices (Hertz weeks later) match via a grace window.
- **The one rule that keeps it clean:** ONE transaction with a `trip` attribute; Payables &
  Travel are just **filtered views**. Travel-category + inside a trip window → Travel; otherwise →
  Payables (e.g. a normal dinner at Percy's = payables, not a trip).
- **QB vendor rollup:** trip expenses post under ONE vendor = the trip header
  (`Travel YYYY-MM — Entity Destination (M/D–M/D)`); the real merchant is the **memo**. Restaurants
  never become QB vendors. (Matches CLAUDE.md `build_trip_header_subject`.)
- **Travel = multi-view app:** sidebar nav (Expense queue · Trips), Trips list (Open/Upcoming/Past),
  trip **itinerary** detail (flights/hotels/cars/meetings + attributed expenses), manual **+ New
  trip** (re-scans recent receipts), itineraries **auto-tie** (only surface when a date overlaps
  two trips), entities **spelled out** (Builders Capital, not BC), **📄 view** invoice per expense.

### Open mockup follow-ups Jacob flagged / I flagged
- Payables rows still show short entity codes (BC/FC) — spell out for consistency.
- Possible Dashboard view (sidebar links to it).
- Drawer-level "This is a travel expense" on Payables (currently row-level only).

## ▶️ Next steps (likely)
1. More mockup tweaks, then **turn the mockups into real portal screens** (Payables + Travel).
2. Merge `portal/operator-bridge` (needs Jacob to free the worktree + resolve repository.py).
3. Set the Azure env flag for prod PDF vision.
4. Per-agent rich actions wired for real (entity choices + Dropbox source links).

## How to resume
- Portal repo: `~/Projects/agent-portal` (branch `main`).
- Backend bridge work: `~/Projects/agent-system`, branch `portal/operator-bridge`.
- Open mockups: `open ~/Projects/agent-portal/docs/mockups/payables_exceptions.html` (and `travel_…`).
- Supabase service key + Graph creds are in `agent-system/.env` (gitignored).

---

# UPDATE — 2026-06-10 PM · Mockups design-complete; ready to build for real

Jacob reviewed all surfaces and signed off ("this is fine for now") — design phase is done; next
work is **real implementation**, not more mockups. All four mockups are committed to `main`
(latest: BC reimbursement + learn-vendor approval, commit `92cdebd`).

## Mockups now final (open via `file://` in `~/Projects/agent-portal/docs/mockups/`)
- **`travel_exceptions.html`** — sidebar app: Dashboard, Expense queue, Trips (Open/Upcoming +
  searchable compact **Past** list), trip detail with **Purpose + Print/Export**. Trip exports are
  **brand-aware**: Builders Capital → **BCX** branding (Roboto, navy `#10102e` / green
  `#177245`,`#7bbf43`), everything else → Foundry. Branded report has a print stylesheet.
- **`payables_exceptions.html`** — exceptions-only queue (entity short codes + tooltips), editable
  drawer coding (GL + pay-from dropdowns), **Learn-vendor approval modal** (previews the QuickBooks
  vendor record + the Outlook contact before saving; applies to all matching invoices), drawer-level
  "this is a travel expense", **Missing-docs** filter with **Attach receipt / "No receipt needed"**
  (waive — keeps the expense without an invoice), batch invoice upload, CSV/QBO intake.
- **`bookkeeper_status.html`** — QBO posting ledger. **Mechanism = QuickBooks Online API over OAuth**
  (NOT Zapier — that decision is dead). Auto-approved items post as a **one-click batch checkpoint**
  ("Post all to QuickBooks"), not per-item. Two-QB intercompany shown with both legs + balance note.
  Errors (retry) + doc-gaps (attach). "QuickBooks connected" OAuth pill.
- **`bc_reimbursement.html`** (new) — BCX-branded Builders Capital reimbursement workspace.
  Aggregates **travel + non-travel** BC expenses → one **Paylocity package** (BCX XLSX + receipts).
  BC posts to PER QB as **Loan – Builders Capital** (balance sheet), cleared by the Paylocity
  Deposit. Include/exclude + live totals, missing-receipt guard, reimbursement history.

## Key product decisions locked this session
- **QB posting = QBO API via OAuth** (Zapier + "Intuit API blocked" are both retired). CLAUDE.md
  amended in `agent-system` (QB posting mechanism / QB attachments / bookkeeper structure sections).
  ⚠️ That CLAUDE.md edit may still be **uncommitted** on `agent-system` branch `portal/operator-bridge`.
- **Operator never approves items one-by-one** — auto-approved items post as a single batch
  checkpoint; operator only touches exceptions (Payables/Travel) + errors/doc-gaps (Bookkeeper).
- **Missing receipts never block posting** — flagged as doc-gaps; attach later or mark "no receipt
  needed."
- **BC is dual:** travel BC → BCX trip reports; non-travel BC → Payables; both bundle into the BC
  reimbursement Paylocity package.

## To start building for real (mockups → live portal)
The portal is live (Next.js 16 / App Router / TS / Tailwind v4, Vercel + Supabase, MS SSO). Suggested
order, each mockup → a real route:
1. **Payables screen** (`/payables`) — highest-value, most-defined. Wire to the operator-action
   bridge (`agent-system/shared/operator/`) + the real classify pipeline (Graph→OpenAI vision already
   proven). Real data: `operator_actions` / `review_queue` in Supabase.
2. **Travel screens** (`/travel` queue + trips + trip detail) — incl. the branded PDF export
   (server-side render with the BCX/Foundry brand tokens from
   `agent-system/agents/valuation/outputs/regression_chart.py` `BRANDS`).
3. **Bookkeeper** (`/bookkeeper`) — needs the real **QBO OAuth API client** built in
   `agent-system/agents/bookkeeper/core/` (replaces `qbo_zapier.py`) + the batch-post endpoint.
4. **BC reimbursement** (`/bc-reimbursement`) — Paylocity XLSX generator + receipt packager
   (`agent-system/agents/payables/bc/` already scaffolded per CLAUDE.md).

## Open backend threads (unchanged, still blocking real wiring)
- `agent-system` branch **`portal/operator-bridge`** still not merged (worktree at `/private/tmp/
  val-phase1` + `agents/valuation/state/repository.py` conflict). Also holds the CLAUDE.md amendment.
- `agents/bookkeeper/core/qbo_zapier.py` needs repointing to the QBO OAuth API client.
- Azure prod: set `ALLOW_FULL_PARSER_MULTIMODAL_FALLBACK=true` for PDF vision.
