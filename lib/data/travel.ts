/**
 * Travel agent data: the expense-attribution queue + trips.
 *
 * Supabase-backed (`trips`, `travel_queue`) with mock fallback — mirrors the
 * approved mockup docs/mockups/travel_exceptions.html.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Upcoming (ends today or later) vs past. No "open for expenses" grace status.
export type TripStatus = "up" | "closed";

const todayISO = () => new Date().toISOString().slice(0, 10);

// Calendar expense categories live in a CLIENT-SAFE module (no server imports) so the client
// component can import them without pulling next/headers into the browser bundle. Re-exported here
// for convenience.
import { CALENDAR_CAT_ICON, calendarCategory } from "@/lib/data/travelCategories";
export { CALENDAR_CATEGORIES, calendarCategory } from "@/lib/data/travelCategories";

// QuickBooks deep-link: posted_legs stores [{role, qbo_id, realm, txn_type, attached}] per leg.
// Build a link to the primary leg's transaction. The txn_type picks the QBO view path.
const QBO_PATH: Record<string, string> = {
  Bill: "bill", Purchase: "expense", Check: "check", BillPayment: "billpayment", Deposit: "deposit",
};
function qboTxnUrl(legs: { qbo_id?: string; txn_type?: string; role?: string }[] | null): string | null {
  if (!Array.isArray(legs) || !legs.length) return null;
  // Prefer the PER/primary leg (not the intercompany duplicate); fall back to the first with an id.
  const leg = legs.find((l) => l.qbo_id && !/intercompany/i.test(l.role ?? "")) ?? legs.find((l) => l.qbo_id);
  if (!leg?.qbo_id) return null;
  const path = QBO_PATH[leg.txn_type ?? ""] ?? "expense";
  return `https://qbo.intuit.com/app/${path}?txnId=${encodeURIComponent(leg.qbo_id)}`;
}

/** Map a trip-attributed payables_queue row into a ledger line. The QB vendor is
 *  the trip header, so the ledger shows the REAL payee (extracted.payee). */
function payableToLedger(r: {
  id: string; vendor: string; memo: string | null; amount: number | string;
  reimbursement_amount: number | string | null;
  gl: string | null; category: string | null; bc_category: string | null; status: string | null;
  doc_url: string | null; nodoc: boolean | null;
  account: string | null; txn_date: string | null; invoice_number: string | null;
  report_id: string | null;
  posted_legs: { qbo_id?: string; txn_type?: string; role?: string }[] | null;
  extracted: { payee?: string; traveler?: string | null; credit_number?: string | null; credit_amount?: number | null; conf?: string | null; confirmation_number?: string | null; confirmation?: string | null } | null;
}): TripExpense {
  const calCat = calendarCategory(r.category);
  const status: ExpenseStatus =
    r.status === "error" ? "error"
      : r.status === "posted" ? "posted"
        : r.status === "accepted" ? "accepted"
          : r.status === "staged" || r.status === "approved" ? "staged"
            : "open";
  return {
    id: r.id,
    ic: CALENDAR_CAT_ICON[calCat] ?? "🧾",
    what: r.extracted?.payee || r.vendor,
    traveler: r.extracted?.traveler ?? null,
    sub: r.memo || r.category || "",
    amount: Number(r.amount),
    gl: r.gl ?? "",
    bcCategory: r.bc_category ?? undefined,
    category: calCat,
    // Match an uploaded receipt to its itinerary flight: the deterministic reader emits
    // `confirmation_number`; older staged rows used `conf`. Accept any so the gap closes.
    confirmation: r.extracted?.conf ?? r.extracted?.confirmation_number ?? r.extracted?.confirmation ?? null,
    status,
    needsDoc: !r.doc_url && !r.nodoc,
    docUrl: r.doc_url ?? null,
    reimbursementAmount: r.reimbursement_amount != null ? Number(r.reimbursement_amount) : Number(r.amount),
    creditNumber: r.extracted?.credit_number ?? null,
    creditAmount: r.extracted?.credit_amount != null ? Number(r.extracted.credit_amount) : null,
    memo: r.memo ?? null,
    reportId: r.report_id ?? null,
    date: r.txn_date ? r.txn_date.slice(0, 10) : null,
    payFrom: r.account || null,
    qbUrl: qboTxnUrl(r.posted_legs),
    qbRef: r.posted_legs?.find((l) => l.txn_type)?.txn_type
      ? `${r.posted_legs.find((l) => l.txn_type)!.txn_type} ${r.invoice_number ?? r.extracted?.conf ?? ""}`.trim()
      : null,
  };
}

// The itinerary is the trip SCHEDULE (from the confirmations), not the expenses — NO dollars.
// One row per flight/train segment + lodging check-in/out + car pickup/return, day-grouped.
export interface ItinItem {
  ic: string;
  day?: string;             // "Wed Jun 17" — the day-group label
  title?: string;           // calendar-style title: "Flight: DL2456 · Boise → Minneapolis"
  when: string;             // time + time zone: "7:15a MT – 11:40a CT" / "Check-in 5:30p ET"
  sub: string;              // travelers (flights) / detail (nights, pickup location)
  conf?: string;            // booking confirmation # — drives the "needs receipt" gap match
  // legacy fields from the prior expense-derived itinerary — tolerated for un-reprocessed trips
  what?: string;
  who?: string;
  amount?: number | null;
  prepaid?: boolean;
}
// Posting lifecycle of a single attributed invoice in the trip ledger.
//   open   = attributed, not yet staged (operator can post it)
//   staged = approved → queued for the backend post_runner (QBO write pending)
//   posted = written to QuickBooks
export type ExpenseStatus = "open" | "staged" | "accepted" | "posted" | "error";
export interface TripExpense {
  id?: string; // payables_queue row id — present for real (postable) invoices
  ic: string;
  what: string; // the real payee (Delta, Westin…), not the trip-header vendor
  traveler?: string | null; // the traveler on this expense (shown on the payee line)
  sub: string; // memo / date
  amount: number;
  gl: string;
  bcCategory?: string; // BC Paylocity category ("Meals - General") — the code BC reports show
  status?: ExpenseStatus;
  needsDoc?: boolean; // attributed but no receipt on file yet (gap, not a blocker)
  docUrl?: string | null; // Dropbox share link to the receipt, when one is on file
  reimbursementAmount?: number; // the trip COST = receipt Total Price (the BC claim). On a reissue
  // chain only the FINAL row carries the claim; earlier same-confirmation rows are 0.
  creditNumber?: string | null; // eCredit/certificate # applied, for visibility
  creditAmount?: number | null; // eCredit AMOUNT applied — shown in-row next to the flight
  creditDrawdown?: number;      // BC-claim reduction when the applied credit is "Expense Cancelled Trip = Yes"
  netReimbursement?: number;    // reimbursementAmount − creditDrawdown (what BC actually pays this row)
  category?: string;            // calendar category (Flights/Lodging/Cars/Rides/Dining) for grouping
  confirmation?: string | null; // booking confirmation # — groups reissue chains in the display
  memo?: string | null;         // the QB memo (deterministic; includes the traveler for travel rows)
  reportId?: string | null;     // expense_reports.id when this expense is on a report ("expensed", BC)
  date?: string | null;         // expense/service date (txn_date) — the ledger Date column
  payFrom?: string | null;      // pay-from account display ("AMEX Delta ••5001")
  qbUrl?: string | null;        // deep link to the posted QuickBooks transaction
  qbRef?: string | null;        // "Bill JLB4PN" — the QB txn type + ref, for the detail line
}
// A confirmation under a review item (one per traveler's ticket on the leg).
export interface ConfReviewConf {
  booking_id?: string;
  conf: string;
  traveler: string;
  net?: number | null;   // net that actually hit the card (0 when an eCredit covered it)
  fare?: number | null;  // reimbursable Total Price — shown inline so the summary lives in the row
  credit?: number | null; // eCredit AMOUNT used = fare − card (accounted BC-only)
  credit_number?: string | null; // eCredit NUMBER — shown for reference on every trip (even when not accounted)
  awaiting_invoice?: boolean; // car/hotel — confirmation only; the folio/charge lands after the trip
  source_url?: string;   // FULL email PDF (document of record / accounting) — "" until filed
  summary_url?: string;  // clean one-page receipt — quick-review glance
  status?: string;      // needs_review | accepted_invoice | accepted_confirmation | declined | posted
  vendor?: string;
  kind?: string;         // route | stay | span | point — the card LAYOUT
  type_label?: string;   // Flight | Train | Ferry | Hotel | Car rental | Parking | Event | Meeting …
  est_total?: number | null; // hotel/car/event CAPTURED estimated cost (not posted until the folio lands)
  est_rate?: number | null;  // hotel nightly / car daily rate, when the confirmation carries it
  // NON-flight cost breakdown (hotel/airbnb/car/event): itemized lines the backend captured off the
  // confirmation — e.g. {"$335.92 × 3 nights": 1007.77}, "Service fee", "Taxes". Rendered as
  // label-left/amount-right rows + a bold Est. total. Absent/empty → fall back to est_total only.
  cost_breakdown?: Array<{ label: string; amount: number }> | null;
  currency?: string | null; // ISO currency for est_total + cost_breakdown amounts (default USD)
}
export interface ConfReviewSeg {
  flight: string;
  route: string;
  depart: string; // "5:30a MT"
  arrive: string; // "9:15a CT"
  day?: string; // per-leg date ("Wed Jul 1") — shown when a round trip spans multiple days
}
// One review item per flight LEG — co-travelers grouped; Split exposes the per-traveler confs.
export interface ConfReviewItem {
  key: string;
  day?: string;
  route: string;
  flights?: string;
  depart?: string;
  segments?: ConfReviewSeg[]; // the schedule (flight · route · times) — summary shown inline
  pnr_count?: number;   // >1 → same flight, different PNRs (booked separately)
  confs: ConfReviewConf[];
}
export interface Trip {
  id: string;
  ent: string;
  dest: string;
  dates: string;
  start: string; // ISO yyyy-mm-dd — source of truth for the QB vendor + upcoming logic
  end: string; // ISO yyyy-mm-dd
  status: TripStatus;
  purpose?: string;
  travelers?: string[]; // trip travelers — from the flights, or entered at manual trip setup
  total: number; // always the SUM of `exps`; 0 when none attributed
  itin: ItinItem[];
  exps: TripExpense[];
  confirmations?: ConfReviewItem[]; // the per-leg review surface (accept the itinerary, not the invoice)
}

/**
 * An incoming travel@ itinerary that matched NO manual trip — the "ask" surface.
 * Written by the backend (public.travel_needs_trip); the operator either creates a trip
 * (pre-filled from these) or dismisses it. Trips are never auto-created.
 */
export interface NeedsTripItem {
  id: string;
  destination: string;
  dates: string;
  startDate: string | null;
  endDate: string | null;
  summary: string;
  sourceUrl?: string | null; // filed confirmation — "view source" before assigning a trip
}

/** A trip a credit has been applied to (the drawdown record). */
export interface CreditApplication {
  usedOnTripId: string;
  usedOnTripName: string;
  confirmation: string | null;
  amount: number;
  date?: string | null;
}

/**
 * An eCredit, owned by the trip that ISSUED it (public.trips.credits jsonb). `reimbursedOrigin`
 * is the whole distinction: true = "as paid" (already reimbursed at the cancelled trip, so it
 * draws down on use), false = "as used" (reimbursed each time it pays a trip, no drawdown).
 */
export interface Credit {
  creditNumber: string;
  vendor: string;
  passenger: string;
  reimbursedOrigin: boolean;
  originalAmount: number | null;
  balanceRemaining: number | null;
  expiration?: string | null;
  status: string; // open | partially_applied | exhausted | expired | pending
  applications: CreditApplication[];
  sourceTripId: string;
  sourceTripName: string;
}

function creditsFromTripRows(rows: { id: string; dest: string; credits?: unknown }[]): Credit[] {
  const out: Credit[] = [];
  for (const r of rows ?? []) {
    const cs = Array.isArray(r.credits) ? r.credits : [];
    for (const c of cs as Record<string, unknown>[]) {
      out.push({
        creditNumber: String(c.credit_number ?? ""),
        vendor: String(c.vendor ?? "Delta Air Lines"),
        passenger: String(c.passenger ?? ""),
        reimbursedOrigin: !!c.reimbursed_origin,
        originalAmount: c.original_amount == null ? null : Number(c.original_amount),
        balanceRemaining: c.balance_remaining == null ? null : Number(c.balance_remaining),
        expiration: (c.expiration as string) ?? null,
        status: String(c.status ?? "open"),
        applications: (Array.isArray(c.applications) ? c.applications : []).map((a: Record<string, unknown>) => ({
          usedOnTripId: String(a.used_on_trip_id ?? ""),
          usedOnTripName: String(a.used_on_trip_name ?? ""),
          confirmation: (a.confirmation as string) ?? null,
          amount: Number(a.amount ?? 0),
          date: (a.date as string) ?? null,
        })),
        sourceTripId: r.id,
        sourceTripName: r.dest,
      });
    }
  }
  out.sort((a, b) => Number(a.status === "exhausted") - Number(b.status === "exhausted") || a.passenger.localeCompare(b.passenger));
  return out;
}

export async function getNeedsTrip(): Promise<NeedsTripItem[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("travel_needs_trip")
      .select("id, destination, dates, start_date, end_date, summary, status, source_url")
      .eq("status", "open")
      .order("start_date", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id,
      destination: r.destination ?? "—",
      dates: r.dates ?? "",
      startDate: r.start_date ?? null,
      endDate: r.end_date ?? null,
      summary: r.summary ?? r.destination ?? "",
      sourceUrl: r.source_url ?? null,
    }));
  } catch {
    return []; // table may not exist yet — no ask items
  }
}

export interface QueueExpense {
  id: string;
  ic: string;
  merchant: string;
  sub: string;
  loc: string;
  home: boolean;
  category: string;
  amount: number;
  trip: string | null;
  suggested: boolean;
  postTrip?: boolean;
  gl: string;
}
/**
 * An itinerary/charge whose date lands inside TWO trip windows — the only case
 * that needs the operator. Surfaced as a choice strip above the queue.
 * Representative until a real overlap source lands in the backend.
 */
export interface OverlapException {
  id: string;
  ic: string;
  title: string;
  sub: string;
  opts: string[];
}

const TRIPS: Trip[] = [
  { id: "trip_manual_b3677933", ent: "UNK", dest: "Spokane", dates: "Jun 5 – 7", start: "2026-06-05", end: "2026-06-07", status: "closed", purpose: "SP Volleyball", total: 0, itin: [], exps: [] },
  { id: "trip_hist_024", ent: "BC", dest: "Paso Robles", dates: "May 20 – 21", start: "2026-05-20", end: "2026-05-21", status: "closed", purpose: "Stg Vinedo with Peachtree", total: 0, itin: [], exps: [] },
  { id: "trip_hist_023", ent: "PER", dest: "Boston", dates: "May 9 – 16", start: "2026-05-09", end: "2026-05-16", status: "closed", purpose: "Nephew Visit", total: 0, itin: [], exps: [] },
  { id: "trip_hist_europe_2026", ent: "PER", dest: "Europe (Paris / Rome)", dates: "Mar 10 – 25", start: "2026-03-10", end: "2026-03-25", status: "closed", purpose: "Spring Break", total: 0, itin: [], exps: [] },
  { id: "trip_hist_022", ent: "PER", dest: "Seattle", dates: "Mar 6 – 8", start: "2026-03-06", end: "2026-03-08", status: "closed", purpose: "Simon Volleyball", total: 0, itin: [], exps: [] },
  { id: "trip_hist_san_diego_2026", ent: "PER", dest: "San Diego", dates: "Feb 26 – Mar 1", start: "2026-02-26", end: "2026-03-01", status: "closed", purpose: "Jacob Vacation", total: 0, itin: [], exps: [] },
  { id: "trip_hist_021", ent: "BC", dest: "Greenville", dates: "Feb 16 – 20", start: "2026-02-16", end: "2026-02-20", status: "closed", purpose: "GLS / Churchill Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_020", ent: "BC", dest: "Seattle", dates: "Feb 9 – 13", start: "2026-02-09", end: "2026-02-13", status: "closed", purpose: "Sales Summit", total: 0, itin: [], exps: [] },
  { id: "trip_hist_019", ent: "BC", dest: "Fort Lauderdale", dates: "Jan 6 – 9", start: "2026-01-06", end: "2026-01-09", status: "closed", purpose: "Peachtree JV Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_jj_xmas_2025", ent: "PER", dest: "Orange County", dates: "Dec 24 – 30", start: "2025-12-24", end: "2025-12-30", status: "closed", purpose: "J&J Xmas Trip", total: 0, itin: [], exps: [] },
  { id: "trip_hist_018", ent: "PER", dest: "Louisville", dates: "Dec 11 – 15", start: "2025-12-11", end: "2025-12-15", status: "closed", purpose: "Simon Volleyball", total: 0, itin: [], exps: [] },
  { id: "trip_hist_017", ent: "BC", dest: "Cleveland", dates: "Nov 30 – Dec 5", start: "2025-11-30", end: "2025-12-05", status: "closed", purpose: "Cleveland Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_025", ent: "BC", dest: "Atlanta", dates: "Nov 17 – 19", start: "2025-11-17", end: "2025-11-19", status: "closed", purpose: "JV Capital Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_016", ent: "BC", dest: "Newark", dates: "Oct 20", start: "2025-10-20", end: "2025-10-20", status: "closed", purpose: "SG Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_015", ent: "BC", dest: "Cleveland", dates: "Oct 12 – 17", start: "2025-10-12", end: "2025-10-17", status: "closed", purpose: "Cleveland Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_014", ent: "BC", dest: "Dallas", dates: "Sep 30 – Oct 3", start: "2025-09-30", end: "2025-10-03", status: "closed", purpose: "Robert / Val Texas Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_013", ent: "BC", dest: "Minneapolis", dates: "Sep 9 – 11", start: "2025-09-09", end: "2025-09-11", status: "closed", purpose: "SAG Site Visits", total: 0, itin: [], exps: [] },
  { id: "trip_hist_012", ent: "BC", dest: "Cleveland", dates: "Aug 24 – Sep 2", start: "2025-08-24", end: "2025-09-02", status: "closed", purpose: "Cleveland Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_011", ent: "BC", dest: "Seattle", dates: "Aug 11", start: "2025-08-11", end: "2025-08-11", status: "closed", purpose: "Curt / Robert Comp Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_010", ent: "BC", dest: "Cleveland", dates: "Jul 28 – Aug 1", start: "2025-07-28", end: "2025-08-01", status: "closed", purpose: "Cleveland Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_009", ent: "BC", dest: "Seattle", dates: "Jul 7 – 10", start: "2025-07-07", end: "2025-07-10", status: "closed", purpose: "Puyallyp Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_008", ent: "BC", dest: "Houston", dates: "Jun 10 – 18", start: "2025-06-10", end: "2025-06-18", status: "closed", purpose: "Shae / Courtney Co-Travel", total: 0, itin: [], exps: [] },
  { id: "trip_hist_007", ent: "BC", dest: "Miami", dates: "May 18 – 23", start: "2025-05-18", end: "2025-05-23", status: "closed", purpose: "FLL Mtg + Trilogy Site Visit", total: 0, itin: [], exps: [] },
  { id: "trip_hist_006", ent: "BC", dest: "Spokane", dates: "May 4 – 9", start: "2025-05-04", end: "2025-05-09", status: "closed", purpose: "Shae Co-Travel", total: 0, itin: [], exps: [] },
  { id: "trip_hist_005", ent: "BC", dest: "Fort Lauderdale", dates: "Apr 14 – 18", start: "2025-04-14", end: "2025-04-18", status: "closed", purpose: "Sales Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_004", ent: "BC", dest: "Salt Lake City", dates: "Mar 28", start: "2025-03-28", end: "2025-03-28", status: "closed", purpose: "Customer Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_003", ent: "BC", dest: "Sacramento", dates: "Mar 22", start: "2025-03-22", end: "2025-03-22", status: "closed", purpose: "Customer Mtg", total: 0, itin: [], exps: [] },
  { id: "trip_hist_002", ent: "BC", dest: "Houston", dates: "Mar 8 – 14", start: "2025-03-08", end: "2025-03-14", status: "closed", purpose: "Shae / Courtney Co-Travel", total: 0, itin: [], exps: [] },
  { id: "trip_hist_001", ent: "BC", dest: "Las Vegas", dates: "Feb 24 – 28", start: "2025-02-24", end: "2025-02-28", status: "closed", purpose: "Broker Conference", total: 0, itin: [], exps: [] },
];

// Queue + overlaps come from the live backend (Supabase public.travel_queue /
// real attribution state). No demo fallback — an empty backend shows empty.
const QUEUE: QueueExpense[] = [];

const OVERLAPS: OverlapException[] = [];

export async function getTravel(): Promise<{
  trips: Trip[];
  queue: QueueExpense[];
  overlaps: OverlapException[];
  credits: Credit[];
}> {
  if (!isSupabaseConfigured()) return { trips: TRIPS, queue: QUEUE, overlaps: OVERLAPS, credits: [] };
  try {
    const supabase = await createClient();
    const [{ data: t }, { data: q }, { data: pq }] = await Promise.all([
      supabase.from("trips").select("*").order("ord"),
      supabase.from("travel_queue").select("*").order("ord"),
      // Real invoices attributed to a trip — the per-trip running ledger.
      supabase
        .from("payables_queue")
        .select("id,vendor,memo,amount,reimbursement_amount,gl,category,bc_category,status,doc_url,nodoc,extracted,trip_id,created_at,account,txn_date,invoice_number,report_id,posted_legs")
        .not("trip_id", "is", null)
        // discarded duplicates / declined items are not part of the trip's expense tie-out — they
        // were showing as phantom extra rows (the Orlando G9FGY2 dups) even though the count excluded them.
        .not("status", "in", "(discarded,declined,reclassified)"),
    ]);
    // Group attributed invoices by trip → ledger lines.
    const ledger = new Map<string, TripExpense[]>();
    for (const r of pq ?? []) {
      const line = payableToLedger(r);
      const arr = ledger.get(r.trip_id) ?? [];
      arr.push(line);
      ledger.set(r.trip_id, arr);
    }
    // eCredit RECONCILIATION (handoff §1). A credit marked "Expense Cancelled Trip = Yes"
    // (reimbursedOrigin) was already claimed at its origin, so a trip that USES it draws down:
    // net reimbursement = fare − eCredit used. "No" credits draw down nothing (full fare reimbursed;
    // the credit only lowered the card charge). Keyed by the credit number on each expense.
    const allCredits = creditsFromTripRows(t ?? []);
    const drawsDown = new Map<string, boolean>(allCredits.map((c) => [c.creditNumber, c.reimbursedOrigin]));
    for (const arr of ledger.values()) {
      for (const e of arr) {
        const gross = e.reimbursementAmount ?? e.amount;
        const dd = e.creditNumber && e.creditAmount && drawsDown.get(e.creditNumber) ? e.creditAmount : 0;
        e.creditDrawdown = dd;
        e.netReimbursement = Math.round((gross - dd) * 100) / 100;
      }
    }
    // Fall back to the mock when the table is empty (not just null/error), so
    // the page is never blank against an unseeded backend.
    const trips: Trip[] =
      t && t.length
        ? t.map((r) => {
            const exps = ledger.get(r.id) ?? [];
            const start = (r.start_date ?? "").slice(0, 10);
            const end = (r.end_date ?? start).slice(0, 10);
            return {
              id: r.id,
              ent: r.ent,
              dest: r.dest,
              dates: r.dates,
              start,
              end,
              // Upcoming when it ends today or later; otherwise past.
              status: (end >= todayISO() ? "up" : "closed") as TripStatus,
              purpose: r.purpose ?? undefined,
              travelers: Array.isArray(r.travelers) ? r.travelers : undefined,
              // Trip total = the FARES for EVERY trip — the expense is the fare (the trip's cost),
              // expensed when taken (Cleveland was the one expensed early). netReimbursement applies
              // the drawdown when a previously-expensed credit is used. The AMEX charge is a separate
              // number that only posts to QuickBooks, never the displayed expense. (Jacob, 2026-06-19.)
              total: exps.reduce((s: number, e: TripExpense) => s + (e.netReimbursement ?? e.reimbursementAmount ?? e.amount), 0),
              itin: r.itin ?? [],
              exps,
              confirmations: Array.isArray(r.confirmations) ? r.confirmations : [],
            };
          })
        : TRIPS;
    const queue: QueueExpense[] =
      q && q.length
        ? q.map((r) => ({
            id: r.id,
            ic: r.ic,
            merchant: r.merchant,
            sub: r.sub ?? "",
            loc: r.loc ?? "",
            home: r.home ?? false,
            category: r.category ?? "",
            amount: Number(r.amount),
            trip: r.trip ?? null,
            suggested: r.suggested ?? false,
            postTrip: r.post_trip ?? false,
            gl: r.gl ?? "",
          }))
        : QUEUE;
    // Overlaps are representative until a real backend source exists; the
    // queue/trips above come from Supabase, the overlap strip from the constant.
    return { trips, queue, overlaps: OVERLAPS, credits: allCredits };
  } catch {
    return { trips: TRIPS, queue: QUEUE, overlaps: OVERLAPS, credits: [] };
  }
}
