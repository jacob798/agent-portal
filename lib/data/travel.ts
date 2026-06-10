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

const TRIPS: Trip[] = [
  {
    id: "den",
    ent: "BC",
    dest: "Denver, CO",
    dates: "Jun 4 – 7",
    status: "open",
    grace: "grace thru Jul 7",
    purpose: "Site visit — Iota St JV",
    total: 1403.02,
    itin: [
      { ic: "✈️", when: "Jun 4 · 9:10a", what: "Delta DL892 — BOI → DEN", sub: "Confirmation #DL77H2" },
      { ic: "🏨", when: "Jun 4–6", what: "Westin Denver Downtown", sub: "2 nights · conf #W8821" },
      { ic: "🚗", when: "Jun 4–7", what: "Hertz — midsize", sub: "DEN airport pickup" },
      { ic: "📍", when: "Jun 5 · 2:00p", what: "Site meeting — Iota St JV", sub: "On calendar" },
      { ic: "✈️", when: "Jun 7 · 6:40p", what: "Delta DL1180 — DEN → BOI", sub: "Confirmation #DL77H2" },
    ],
    exps: [
      { ic: "✈️", what: "Delta Air Lines", sub: "Airfare · Jun 4", amount: 410.0, gl: "6730 Travel — Airfare" },
      { ic: "🚕", what: "Uber", sub: "Rideshare · Jun 4", amount: 28.5, gl: "6720 Travel — Ground" },
      { ic: "🏨", what: "Westin Denver", sub: "Lodging · Jun 5", amount: 612.0, gl: "6700 Travel — Lodging" },
      { ic: "🍽️", what: "Chandlers Steakhouse", sub: "Dining · Jun 5", amount: 84.2, gl: "6710 Travel — Meals" },
      { ic: "☕", what: "Dutch Bros", sub: "Dining · Jun 6", amount: 9.15, gl: "6710 Travel — Meals" },
      { ic: "🚕", what: "Uber", sub: "Rideshare · Jun 6", amount: 19.2, gl: "6720 Travel — Ground" },
      { ic: "🚗", what: "Hertz", sub: "Ground · invoiced Jun 21 (post-trip)", amount: 240.0, gl: "6720 Travel — Ground" },
    ],
  },
  {
    id: "sea",
    ent: "FC",
    dest: "Seattle, WA",
    dates: "Jun 18 – 20",
    status: "up",
    purpose: "Investor meetings",
    total: 0,
    itin: [
      { ic: "✈️", when: "Jun 18 · 7:25a", what: "Delta DL1234 — BOI → SEA", sub: "Confirmation pending" },
      { ic: "🏨", when: "Jun 18–20", what: "Hotel — TBD", sub: "Not booked yet" },
    ],
    exps: [],
  },
  {
    id: "slc",
    ent: "BC",
    dest: "Salt Lake City, UT",
    dates: "May 28 – 30",
    status: "closed",
    purpose: "Lender conference",
    total: 2110.4,
    itin: [],
    exps: [
      { ic: "🏨", what: "Marriott SLC", sub: "Lodging", amount: 1180.0, gl: "6700" },
      { ic: "✈️", what: "Delta", sub: "Airfare", amount: 520.0, gl: "6730" },
      { ic: "🍽️", what: "Meals (5)", sub: "Dining", amount: 410.4, gl: "6710" },
    ],
  },
  { id: "pdx", ent: "FC", dest: "Portland, OR", dates: "Apr 14 – 16", status: "closed", purpose: "Property tour", total: 1640.0, itin: [], exps: [{ ic: "🏨", what: "Hotel", sub: "", amount: 980, gl: "6700" }, { ic: "✈️", what: "Air", sub: "", amount: 660, gl: "6730" }] },
  { id: "phx", ent: "BC", dest: "Phoenix, AZ", dates: "Mar 3 – 5", status: "closed", purpose: "Builders Capital offsite", total: 1925.0, itin: [], exps: [] },
];

const QUEUE: QueueExpense[] = [
  { id: "e1", ic: "🏨", merchant: "Westin Denver", sub: "AMEX WJW ••1004 · Jun 5 · Lodging", loc: "Denver, CO", home: false, category: "Lodging", amount: 612.0, trip: "Builders Capital · Denver", suggested: true, gl: "6700 Travel — Lodging" },
  { id: "e2", ic: "🍽️", merchant: "Chandlers Steakhouse", sub: "AMEX WJW ••1004 · Jun 5 · Dining", loc: "Denver, CO", home: false, category: "Dining", amount: 84.2, trip: "Builders Capital · Denver", suggested: true, gl: "6710 Travel — Meals" },
  { id: "e3", ic: "🚗", merchant: "Hertz", sub: "Invoiced Jun 21 · Jun 4–7 rental", loc: "Denver, CO", home: false, category: "Transport", amount: 240.0, trip: "Builders Capital · Denver", suggested: true, postTrip: true, gl: "6720 Travel — Ground" },
  { id: "e4", ic: "✈️", merchant: "Delta Air Lines", sub: "AMEX Delta ••5001 · Jun 4 · Airfare", loc: "—", home: false, category: "Airfare", amount: 410.0, trip: "Builders Capital · Denver", suggested: true, gl: "6730 Travel — Airfare" },
  { id: "e5", ic: "☕", merchant: "Dutch Bros", sub: "AMEX WJW ••1004 · Jun 6 · Dining", loc: "Denver, CO", home: false, category: "Dining", amount: 9.15, trip: "Builders Capital · Denver", suggested: true, gl: "6710 Travel — Meals" },
  { id: "eu1", ic: "🚕", merchant: "Uber", sub: "AMEX WJW ••1004 · Jun 4 · Rideshare (DEN→hotel)", loc: "Denver, CO", home: false, category: "Transport", amount: 28.5, trip: "Builders Capital · Denver", suggested: true, gl: "6720 Travel — Ground" },
  { id: "eu2", ic: "🚕", merchant: "Uber", sub: "AMEX WJW ••1004 · Jun 6 · Rideshare (site visit)", loc: "Denver, CO", home: false, category: "Transport", amount: 19.2, trip: "Builders Capital · Denver", suggested: true, gl: "6720 Travel — Ground" },
  { id: "e6", ic: "🍽️", merchant: "Goldy's Breakfast", sub: "AMEX WJW ••1004 · Jun 12 · Dining", loc: "Boise, ID", home: true, category: "Dining", amount: 31.4, trip: null, suggested: false, gl: "7800 Personal" },
];

export async function getTravel(): Promise<{ trips: Trip[]; queue: QueueExpense[] }> {
  if (!isSupabaseConfigured()) return { trips: TRIPS, queue: QUEUE };
  try {
    const supabase = await createClient();
    const [{ data: t }, { data: q }] = await Promise.all([
      supabase.from("trips").select("*").order("ord"),
      supabase.from("travel_queue").select("*").order("ord"),
    ]);
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
    return { trips, queue };
  } catch {
    return { trips: TRIPS, queue: QUEUE };
  }
}
