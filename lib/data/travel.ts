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

// Icon by travel category, for the ledger rows.
const CAT_ICON: Record<string, string> = {
  airfare: "✈️", hotel: "🏨", lodging: "🏨", meals: "🍽️", dining: "🍽️",
  "car rental": "🚗", "ground transportation": "🚕", transport: "🚕",
  fuel: "⛽", parking: "🅿️",
};

/** Map a trip-attributed payables_queue row into a ledger line. The QB vendor is
 *  the trip header, so the ledger shows the REAL payee (extracted.payee). */
function payableToLedger(r: {
  id: string; vendor: string; memo: string | null; amount: number | string;
  gl: string | null; category: string | null; bc_category: string | null; status: string | null;
  doc_url: string | null; nodoc: boolean | null;
  extracted: { payee?: string } | null;
}): TripExpense {
  const cat = (r.category ?? "").toLowerCase();
  const status: ExpenseStatus = r.status === "posted" ? "posted" : r.status === "approved" ? "staged" : "open";
  return {
    id: r.id,
    ic: CAT_ICON[cat] ?? "🧾",
    what: r.extracted?.payee || r.vendor,
    sub: r.memo || r.category || "",
    amount: Number(r.amount),
    gl: r.gl ?? "",
    bcCategory: r.bc_category ?? undefined,
    status,
    needsDoc: !r.doc_url && !r.nodoc,
    docUrl: r.doc_url ?? null,
  };
}

export interface ItinItem {
  ic: string;
  when: string;
  what: string;
  sub: string;
}
// Posting lifecycle of a single attributed invoice in the trip ledger.
//   open   = attributed, not yet staged (operator can post it)
//   staged = approved → queued for the backend post_runner (QBO write pending)
//   posted = written to QuickBooks
export type ExpenseStatus = "open" | "staged" | "posted";
export interface TripExpense {
  id?: string; // payables_queue row id — present for real (postable) invoices
  ic: string;
  what: string; // the real payee (Delta, Westin…), not the trip-header vendor
  sub: string; // memo / date
  amount: number;
  gl: string;
  bcCategory?: string; // BC Paylocity category ("Meals - General") — the code BC reports show
  status?: ExpenseStatus;
  needsDoc?: boolean; // attributed but no receipt on file yet (gap, not a blocker)
  docUrl?: string | null; // Dropbox share link to the receipt, when one is on file
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
  total: number; // always the SUM of `exps`; 0 when none attributed
  itin: ItinItem[];
  exps: TripExpense[];
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
}

export async function getNeedsTrip(): Promise<NeedsTripItem[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("travel_needs_trip")
      .select("id, destination, dates, start_date, end_date, summary, status")
      .eq("status", "open")
      .order("start_date", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id,
      destination: r.destination ?? "—",
      dates: r.dates ?? "",
      startDate: r.start_date ?? null,
      endDate: r.end_date ?? null,
      summary: r.summary ?? r.destination ?? "",
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
}> {
  if (!isSupabaseConfigured()) return { trips: TRIPS, queue: QUEUE, overlaps: OVERLAPS };
  try {
    const supabase = await createClient();
    const [{ data: t }, { data: q }, { data: pq }] = await Promise.all([
      supabase.from("trips").select("*").order("ord"),
      supabase.from("travel_queue").select("*").order("ord"),
      // Real invoices attributed to a trip — the per-trip running ledger.
      supabase
        .from("payables_queue")
        .select("id,vendor,memo,amount,gl,category,bc_category,status,doc_url,nodoc,extracted,trip_id,created_at")
        .not("trip_id", "is", null),
    ]);
    // Group attributed invoices by trip → ledger lines.
    const ledger = new Map<string, TripExpense[]>();
    for (const r of pq ?? []) {
      const line = payableToLedger(r);
      const arr = ledger.get(r.trip_id) ?? [];
      arr.push(line);
      ledger.set(r.trip_id, arr);
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
              // Total always reflects the attributed detail (0 when none).
              total: exps.reduce((s: number, e: TripExpense) => s + e.amount, 0),
              itin: r.itin ?? [],
              exps,
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
    return { trips, queue, overlaps: OVERLAPS };
  } catch {
    return { trips: TRIPS, queue: QUEUE, overlaps: OVERLAPS };
  }
}
