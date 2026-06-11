/**
 * Travel agent data: the expense-attribution queue + trips.
 *
 * Supabase-backed (`trips`, `travel_queue`) with mock fallback — mirrors the
 * approved mockup docs/mockups/travel_exceptions.html.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type TripStatus = "open" | "up" | "closed";

export interface ItinItem {
  ic: string;
  when: string;
  what: string;
  sub: string;
}
export interface TripExpense {
  ic: string;
  what: string;
  sub: string;
  amount: number;
  gl: string;
}
export interface Trip {
  id: string;
  ent: string;
  dest: string;
  dates: string;
  status: TripStatus;
  grace?: string;
  purpose?: string;
  total: number;
  itin: ItinItem[];
  exps: TripExpense[];
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
  { id: "trip_manual_b3677933", ent: "UNK", dest: "Spokane", dates: "Jun 5 – 7", status: "open", grace: "grace thru Jul 7", purpose: "SP Volleyball", total: 0.0, itin: [], exps: [] },
  { id: "trip_hist_024", ent: "BC", dest: "Paso Robles", dates: "May 20 – 21", status: "open", grace: "grace thru Jun 20", purpose: "Stg Vinedo with Peachtree", total: 358.2, itin: [], exps: [] },
  { id: "trip_hist_023", ent: "PER", dest: "Boston", dates: "May 9 – 16", status: "open", grace: "grace thru Jun 15", purpose: "Nephew Visit", total: 1029.4, itin: [], exps: [] },
  { id: "trip_hist_europe_2026", ent: "PER", dest: "Europe (Paris / Rome)", dates: "Mar 10 – 25", status: "closed", purpose: "Spring Break", total: 76.33, itin: [], exps: [] },
  { id: "trip_hist_022", ent: "PER", dest: "Seattle", dates: "Mar 6 – 8", status: "closed", purpose: "Simon Volleyball", total: 256.96, itin: [], exps: [] },
  { id: "trip_hist_san_diego_2026", ent: "PER", dest: "San Diego", dates: "Feb 26 – Mar 1", status: "closed", purpose: "Jacob Vacation", total: 11.2, itin: [], exps: [] },
  { id: "trip_hist_021", ent: "BC", dest: "Greenville", dates: "Feb 16 – 20", status: "closed", purpose: "GLS / Churchill Mtg", total: 898.4, itin: [], exps: [] },
  { id: "trip_hist_020", ent: "BC", dest: "Seattle", dates: "Feb 9 – 13", status: "closed", purpose: "Sales Summit", total: 636.81, itin: [], exps: [] },
  { id: "trip_hist_019", ent: "BC", dest: "Fort Lauderdale", dates: "Jan 6 – 9", status: "closed", purpose: "Peachtree JV Mtg", total: 826.59, itin: [], exps: [] },
  { id: "trip_hist_jj_xmas_2025", ent: "PER", dest: "Orange County", dates: "Dec 24 – 30", status: "closed", purpose: "J&J Xmas Trip", total: 0.0, itin: [], exps: [] },
  { id: "trip_hist_018", ent: "PER", dest: "Louisville", dates: "Dec 11 – 15", status: "closed", purpose: "Simon Volleyball", total: 628.36, itin: [], exps: [] },
  { id: "trip_hist_017", ent: "BC", dest: "Cleveland", dates: "Nov 30 – Dec 5", status: "closed", purpose: "Cleveland Mtg", total: 1029.37, itin: [], exps: [] },
  { id: "trip_hist_025", ent: "BC", dest: "Atlanta", dates: "Nov 17 – 19", status: "closed", purpose: "JV Capital Mtg", total: 1436.96, itin: [], exps: [] },
  { id: "trip_hist_016", ent: "BC", dest: "Newark", dates: "Oct 20", status: "closed", purpose: "SG Mtg", total: 399.19, itin: [], exps: [] },
  { id: "trip_hist_015", ent: "BC", dest: "Cleveland", dates: "Oct 12 – 17", status: "closed", purpose: "Cleveland Mtg", total: 568.19, itin: [], exps: [] },
  { id: "trip_hist_014", ent: "BC", dest: "Dallas", dates: "Sep 30 – Oct 3", status: "closed", purpose: "Robert / Val Texas Mtg", total: 642.37, itin: [], exps: [] },
  { id: "trip_hist_013", ent: "BC", dest: "Minneapolis", dates: "Sep 9 – 11", status: "closed", purpose: "SAG Site Visits", total: 1226.67, itin: [], exps: [] },
  { id: "trip_hist_012", ent: "BC", dest: "Cleveland", dates: "Aug 24 – Sep 2", status: "closed", purpose: "Cleveland Mtg", total: 710.36, itin: [], exps: [] },
  { id: "trip_hist_011", ent: "BC", dest: "Seattle", dates: "Aug 11", status: "closed", purpose: "Curt / Robert Comp Mtg", total: 446.97, itin: [], exps: [] },
  { id: "trip_hist_010", ent: "BC", dest: "Cleveland", dates: "Jul 28 – Aug 1", status: "closed", purpose: "Cleveland Mtg", total: 783.37, itin: [], exps: [] },
  { id: "trip_hist_009", ent: "BC", dest: "Seattle", dates: "Jul 7 – 10", status: "closed", purpose: "Puyallyp Mtg", total: 546.97, itin: [], exps: [] },
  { id: "trip_hist_008", ent: "BC", dest: "Houston", dates: "Jun 10 – 18", status: "closed", purpose: "Shae / Courtney Co-Travel", total: 1065.14, itin: [], exps: [] },
  { id: "trip_hist_007", ent: "BC", dest: "Miami", dates: "May 18 – 23", status: "closed", purpose: "FLL Mtg + Trilogy Site Visit", total: 1109.16, itin: [], exps: [] },
  { id: "trip_hist_006", ent: "BC", dest: "Spokane", dates: "May 4 – 9", status: "closed", purpose: "Shae Co-Travel", total: 1146.97, itin: [], exps: [] },
  { id: "trip_hist_005", ent: "BC", dest: "Fort Lauderdale", dates: "Apr 14 – 18", status: "closed", purpose: "Sales Mtg", total: 868.75, itin: [], exps: [] },
  { id: "trip_hist_004", ent: "BC", dest: "Salt Lake City", dates: "Mar 28", status: "closed", purpose: "Customer Mtg", total: 726.96, itin: [], exps: [] },
  { id: "trip_hist_003", ent: "BC", dest: "Sacramento", dates: "Mar 22", status: "closed", purpose: "Customer Mtg", total: 128.49, itin: [], exps: [] },
  { id: "trip_hist_002", ent: "BC", dest: "Houston", dates: "Mar 8 – 14", status: "closed", purpose: "Shae / Courtney Co-Travel", total: 810.45, itin: [], exps: [] },
  { id: "trip_hist_001", ent: "BC", dest: "Las Vegas", dates: "Feb 24 – 28", status: "closed", purpose: "Broker Conference", total: 562.37, itin: [], exps: [] },
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
    const [{ data: t }, { data: q }] = await Promise.all([
      supabase.from("trips").select("*").order("ord"),
      supabase.from("travel_queue").select("*").order("ord"),
    ]);
    // Fall back to the mock when the table is empty (not just null/error), so
    // the page is never blank against an unseeded backend.
    const trips: Trip[] =
      t && t.length
        ? t.map((r) => ({
            id: r.id,
            ent: r.ent,
            dest: r.dest,
            dates: r.dates,
            status: r.status,
            grace: r.grace ?? undefined,
            purpose: r.purpose ?? undefined,
            total: Number(r.total),
            itin: r.itin ?? [],
            exps: (r.exps ?? []).map((e: TripExpense) => ({ ...e, amount: Number(e.amount) })),
          }))
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
