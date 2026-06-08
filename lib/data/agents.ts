/**
 * Agent health data for the dashboard.
 *
 * Queries the Supabase `agent_health` table when the backend is configured
 * (env vars present); otherwise returns mock data so the portal stays usable.
 * The query is defensive — any error falls back to mock. Expected table shape
 * is defined in supabase/migrations/0001_portal.sql.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AgentStatus = "healthy" | "degraded" | "down" | "idle";

export interface AgentHealth {
  id: string;
  name: string;
  status: AgentStatus;
  /** ISO timestamp of the last completed run, or null if never run. */
  lastRunAt: string | null;
  /** Items waiting in this agent's review/work queue. */
  queueDepth: number;
  description: string;
}

const MOCK_AGENTS: AgentHealth[] = [
  {
    id: "travel",
    name: "Travel",
    status: "healthy",
    lastRunAt: "2026-06-07T22:14:00Z",
    queueDepth: 2,
    description: "Trip reconstruction, bookings, and travel expense classification.",
  },
  {
    id: "payables",
    name: "Payables",
    status: "healthy",
    lastRunAt: "2026-06-07T21:58:00Z",
    queueDepth: 5,
    description: "Invoice intake, entity/GL classification, and coding.",
  },
  {
    id: "bookkeeper",
    name: "Bookkeeper",
    status: "idle",
    lastRunAt: "2026-06-07T18:30:00Z",
    queueDepth: 0,
    description: "QuickBooks posting authority, trip attribution, and dedup.",
  },
  {
    id: "statement-reconciliation",
    name: "Statement Reconciliation",
    status: "degraded",
    lastRunAt: "2026-06-06T09:12:00Z",
    queueDepth: 11,
    description: "Statement ingestion and document-to-charge matching.",
  },
  {
    id: "valuation",
    name: "Valuation",
    status: "healthy",
    lastRunAt: "2026-06-07T20:05:00Z",
    queueDepth: 3,
    description: "Construction loan valuation, comps, and underwriting notes.",
  },
  {
    id: "contacts",
    name: "Contacts",
    status: "healthy",
    lastRunAt: "2026-06-07T19:40:00Z",
    queueDepth: 0,
    description: "Contact extraction, enrichment, and Outlook sync.",
  },
];

/** Returns the health snapshot for every agent (live when wired, else mock). */
export async function getAgents(): Promise<AgentHealth[]> {
  if (!isSupabaseConfigured()) return MOCK_AGENTS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agent_health")
      .select("id, name, status, last_run_at, queue_depth, description")
      .order("name");

    if (error || !data) return MOCK_AGENTS;

    return data.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status as AgentStatus,
      lastRunAt: r.last_run_at,
      queueDepth: r.queue_depth ?? 0,
      description: r.description ?? "",
    }));
  } catch {
    return MOCK_AGENTS;
  }
}
