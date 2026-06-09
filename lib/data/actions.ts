/**
 * Operator-action loop — the data layer agents and the portal share.
 *
 * Queries Supabase `operator_actions` when configured; mock otherwise.
 * Agents emit rows here (replacing Teams cards); the portal resolves them.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type ActionType = "approval" | "choice" | "input" | "alert";
export type ActionPriority = "high" | "medium" | "low";
export type ActionStatus = "pending" | "resolved" | "dismissed";

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface OperatorAction {
  id: string;
  agent: string;
  agentLabel: string;
  type: ActionType;
  title: string;
  body: string;
  options: ChoiceOption[];
  priority: ActionPriority;
  entity?: string;
  amount?: number;
  /** Directly-viewable link to the source document (PDF/email) for this action. */
  sourceUrl?: string;
  sourceLabel?: string;
  status: ActionStatus;
  createdAt: string;
}

const MOCK_ACTIONS: OperatorAction[] = [
  {
    id: "act_001",
    agent: "payables",
    agentLabel: "Payables",
    type: "choice",
    title: "Which entity for this Home Depot invoice?",
    body: "Ship-to address matches two projects. Pick the entity to code it to.",
    options: [
      { value: "IOTA", label: "Iota Street Garden City" },
      { value: "WB12", label: "Waterbrook 1 and 12" },
      { value: "UNK", label: "Leave for review" },
    ],
    priority: "high",
    entity: "UNK",
    amount: 4218.55,
    sourceUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    sourceLabel: "Invoice — Home Depot #426182812.pdf",
    status: "pending",
    createdAt: "2026-06-08T15:40:00Z",
  },
  {
    id: "act_002",
    agent: "travel",
    agentLabel: "Travel",
    type: "approval",
    title: "Attribute Boise Marriott charge to the June BC trip?",
    body: "AMEX charge $612.00 falls in the trip window but has no booking match. Approve to attach it to the trip.",
    options: [],
    priority: "medium",
    entity: "BC",
    amount: 612.0,
    status: "pending",
    createdAt: "2026-06-08T14:05:00Z",
  },
  {
    id: "act_003",
    agent: "contacts",
    agentLabel: "Contacts",
    type: "input",
    title: "Email needed for Dana Reyes",
    body: "Referral contact has no email and enrichment didn't resolve one. Enter it to finish the contact.",
    options: [],
    priority: "low",
    status: "pending",
    createdAt: "2026-06-08T11:48:00Z",
  },
  {
    id: "act_004",
    agent: "statement-reconciliation",
    agentLabel: "Statement Reconciliation",
    type: "alert",
    title: "3 charges on the May Citi statement still lack receipts",
    body: "Documentation-gap follow-up. Acknowledge to clear this alert.",
    options: [],
    priority: "medium",
    entity: "PC",
    status: "pending",
    createdAt: "2026-06-08T09:30:00Z",
  },
];

export async function getOperatorActions(): Promise<OperatorAction[]> {
  if (!isSupabaseConfigured()) return MOCK_ACTIONS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("operator_actions")
      .select(
        "id, agent, agent_label, type, title, body, options, priority, entity, amount, source_url, source_label, status, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error || !data) return MOCK_ACTIONS;

    return data.map((r) => ({
      id: r.id,
      agent: r.agent,
      agentLabel: r.agent_label,
      type: r.type as ActionType,
      title: r.title,
      body: r.body ?? "",
      options: (r.options as ChoiceOption[] | null) ?? [],
      priority: r.priority as ActionPriority,
      entity: r.entity ?? undefined,
      amount: r.amount ?? undefined,
      sourceUrl: r.source_url ?? undefined,
      sourceLabel: r.source_label ?? undefined,
      status: r.status as ActionStatus,
      createdAt: r.created_at,
    }));
  } catch {
    return MOCK_ACTIONS;
  }
}
