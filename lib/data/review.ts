/**
 * Review queue data — items awaiting operator review across agents.
 *
 * Queries the Supabase `review_queue` table when the backend is configured;
 * otherwise returns mock data so the queue stays usable. Defensive — any error
 * falls back to mock. Expected table shape is in supabase/migrations/0001_portal.sql.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type ReviewPriority = "high" | "medium" | "low";

export interface ReviewItem {
  id: string;
  agent: string;
  agentLabel: string;
  title: string;
  summary: string;
  entity?: string;
  amount?: number;
  priority: ReviewPriority;
  status: ReviewStatus;
  /** ISO timestamp the item entered the queue. */
  createdAt: string;
}

const MOCK_ITEMS: ReviewItem[] = [
  {
    id: "rev_001",
    agent: "payables",
    agentLabel: "Payables",
    title: "Ambiguous entity on Home Depot invoice",
    summary:
      "Ship-to address matches two projects (Iota St vs Waterbrook). Needs an entity decision before coding.",
    entity: "UNK",
    amount: 4218.55,
    priority: "high",
    status: "pending",
    createdAt: "2026-06-07T21:40:00Z",
  },
  {
    id: "rev_002",
    agent: "valuation",
    agentLabel: "Valuation",
    title: "Comp set below confidence threshold",
    summary:
      "Only 2 of 4 comps within radius for 1428 Silver Valley. Confirm before underwriting note is finalized.",
    entity: "FC",
    priority: "high",
    status: "pending",
    createdAt: "2026-06-07T20:12:00Z",
  },
  {
    id: "rev_003",
    agent: "travel",
    agentLabel: "Travel",
    title: "Unmatched hotel charge — no trip context",
    summary:
      "AMEX charge from Boise Marriott has no booking or calendar match within the date window.",
    entity: "BC",
    amount: 612.0,
    priority: "medium",
    status: "pending",
    createdAt: "2026-06-07T18:05:00Z",
  },
  {
    id: "rev_004",
    agent: "payables",
    agentLabel: "Payables",
    title: "Split-GL allocation on Amazon order",
    summary:
      "Order spans office supplies and tools across two entities. Confirm the per-line-item split.",
    entity: "WJW",
    amount: 287.43,
    priority: "medium",
    status: "pending",
    createdAt: "2026-06-07T16:22:00Z",
  },
  {
    id: "rev_005",
    agent: "contacts",
    agentLabel: "Contacts",
    title: "Missing email for referred contact",
    summary:
      "Contact 'Dana Reyes' extracted from a referral has no email; enrichment did not resolve one.",
    priority: "low",
    status: "pending",
    createdAt: "2026-06-06T14:48:00Z",
  },
  {
    id: "rev_006",
    agent: "statement-reconciliation",
    agentLabel: "Statement Reconciliation",
    title: "3 charges missing documentation",
    summary:
      "May Citi statement has three charges with no matched receipt. Flagged for documentation follow-up.",
    entity: "PC",
    amount: 1944.18,
    priority: "medium",
    status: "approved",
    createdAt: "2026-06-05T11:30:00Z",
  },
  {
    id: "rev_007",
    agent: "valuation",
    agentLabel: "Valuation",
    title: "Budget line exceeds regional cost band",
    summary:
      "Framing cost/SF is 22% above the regional band. Operator confirmed as accurate for this build.",
    entity: "FC",
    priority: "low",
    status: "rejected",
    createdAt: "2026-06-04T09:15:00Z",
  },
];

/** Returns all review items (live when wired, else mock). */
export async function getReviewItems(): Promise<ReviewItem[]> {
  if (!isSupabaseConfigured()) return MOCK_ITEMS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("review_queue")
      .select(
        "id, agent, agent_label, title, summary, entity, amount, priority, status, created_at",
      )
      .order("created_at", { ascending: false });

    if (error || !data) return MOCK_ITEMS;

    return data.map((r) => ({
      id: r.id,
      agent: r.agent,
      agentLabel: r.agent_label,
      title: r.title,
      summary: r.summary ?? "",
      entity: r.entity ?? undefined,
      amount: r.amount ?? undefined,
      priority: r.priority as ReviewPriority,
      status: r.status as ReviewStatus,
      createdAt: r.created_at,
    }));
  } catch {
    return MOCK_ITEMS;
  }
}
