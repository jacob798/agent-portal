/**
 * Briefings review data — held drafts from captured voice notes / meetings.
 *
 * Queries the Supabase `briefings_notes` table (status='planned') when the
 * backend is configured; otherwise returns mock data so the screen stays usable.
 * Same defensive pattern as lib/data/payables.ts. The mock mirrors the approved
 * mockup in docs/mockups/briefings_review.html.
 */
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface DealRef {
  id: number | null;
  title?: string | null;
  confident?: boolean;
  candidates?: { id: number; title: string; score: number }[];
}
export interface FollowUp {
  text: string;
  due: string | null;
  kind: "call" | "task" | "email";
  to_pipedrive: boolean;
  to_asana: boolean;
  keep: boolean;
}
export interface Draft {
  draft_id: string;
  kind: "deal" | "personal";
  deal: DealRef | null;
  recap: string;
  interaction: { type: string } | null;
  follow_ups: FollowUp[];
  todos?: { text: string; keep: boolean }[];
  capital_update: string;
  waiting_on: string[];
  counterparty?: string;
}
export interface BriefingNote {
  id: string;
  source_id: string;
  title: string;
  transcript: string;
  status: string;
  received_at: string;
  drafts: Draft[];
  skip_reason?: string | null;
}

const MOCK: BriefingNote[] = [
  {
    id: "mock-1", source_id: "vn1", title: "Richard Zollinger — Siena call",
    transcript: "Talk to Richard Zollinger from Mesa Bridge on Ciena Dev, $10M development loan. He's going to follow up with his capital partners and let me know this week. My next action is probably to follow up with him on Friday.",
    status: "planned", received_at: new Date().toISOString(),
    drafts: [{
      draft_id: "vn1#0", kind: "deal",
      deal: { id: 474, title: "Siena Valley Club: 8 Loans x 1 SFR", confident: true,
        candidates: [{ id: 474, title: "Siena Valley Club: 8 Loans x 1 SFR", score: 1 }] },
      recap: "6/10 — Call with Richard Zollinger (Mesa Bridge) on Siena Valley Club, $10M development loan. Richard is taking it to his capital partners and will report back this week.",
      interaction: { type: "call" },
      follow_ups: [{ text: "Follow up with Richard Zollinger (Mesa Bridge) — Siena Valley Club", due: "2026-06-12", kind: "call", to_pipedrive: true, to_asana: true, keep: true }],
      capital_update: "", waiting_on: ["Richard to report back from his capital partners — this week"],
      counterparty: "Richard Zollinger (Mesa Bridge)",
    }],
  },
  {
    id: "mock-2", source_id: "vn2", title: "Hidden Mill walk + my to-dos",
    transcript: "Walked the Hidden Mill site, vertical looks about 70 percent. Need to send the updated draw schedule to the lender, and remind myself to book the Boise flight for the 24th.",
    status: "planned", received_at: new Date().toISOString(),
    drafts: [
      {
        draft_id: "vn2#0", kind: "deal",
        deal: { id: null, confident: false },
        recap: "6/10 — Site walk at Hidden Mill: vertical ~70% complete.",
        interaction: { type: "meeting" },
        follow_ups: [{ text: "Send updated draw schedule to the lender", due: null, kind: "email", to_pipedrive: true, to_asana: true, keep: true }],
        capital_update: "", waiting_on: [], counterparty: "",
      },
      {
        draft_id: "vn2#personal", kind: "personal", deal: null, recap: "",
        interaction: null, follow_ups: [],
        todos: [{ text: "Book Boise flight for the 24th", keep: true }],
        capital_update: "", waiting_on: [],
      },
    ],
  },
];

export async function getBriefingsDrafts(): Promise<BriefingNote[]> {
  if (!isSupabaseConfigured()) return MOCK;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("briefings_notes")
      .select("id,source_id,title,transcript,status,received_at,drafts,skip_reason")
      .eq("status", "planned")
      .order("received_at", { ascending: false });
    if (error || !data || data.length === 0) return MOCK;
    return data as BriefingNote[];
  } catch {
    return MOCK;
  }
}
