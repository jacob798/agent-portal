/**
 * Review queue data — items awaiting operator review across agents.
 *
 * MOCK for now so the queue is usable before Supabase is live. To go live:
 *  - replace getReviewItems() with a Supabase query
 *  - implement resolveReviewItem() as a server action that updates the row
 * The types stay the same so the UI doesn't change.
 */

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

/** Returns all review items (optionally you can filter client-side). */
export async function getReviewItems(): Promise<ReviewItem[]> {
  // TODO(supabase): replace with a query against the review_queue table.
  return MOCK_ITEMS;
}
