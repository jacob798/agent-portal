/**
 * Rules & Learning console data — reads the LIVE learning + routing tables the agent
 * populates (documents, predictions, signal_stats, identifier_index, field_aliases,
 * doc_type_routing, doc_types, vendors). Admin (service-role) reads; every function is
 * defensive (returns empty on error) so the page never breaks.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FailureReason { reason: string; count: number; tone: "blue" | "amber" | "red" }
export interface LearnedItem { kind: string; title: string; detail: string; actionKind: "vendor" | "identifier" | "alias"; key: string }
export interface RouteRow { docType: string; label: string; agents: string[]; status: string }
export interface KnowledgeVendor { name: string; aliases: string[]; entity: string | null; source: "learned" | "curated" | "synced" }
export interface LearningStats { documents: number; predictions: number; learnedIdentifiers: number; signals: number }

function db() { return createAdminClient(); }

export async function getLearningStats(): Promise<LearningStats> {
  try {
    const c = db();
    const [d, p, i, s] = await Promise.all([
      c.from("documents").select("*", { count: "exact", head: true }),
      c.from("predictions").select("*", { count: "exact", head: true }),
      c.from("identifier_index").select("*", { count: "exact", head: true }),
      c.from("signal_stats").select("*", { count: "exact", head: true }),
    ]);
    return {
      documents: d.count ?? 0, predictions: p.count ?? 0,
      learnedIdentifiers: i.count ?? 0, signals: s.count ?? 0,
    };
  } catch { return { documents: 0, predictions: 0, learnedIdentifiers: 0, signals: 0 }; }
}

export async function getFailureReport(): Promise<FailureReason[]> {
  try {
    const c = db();
    const { data } = await c.from("documents")
      .select("status, routing_status, exception_fields")
      .order("updated_at", { ascending: false })
      .limit(2000);
    const tally = new Map<string, number>();
    for (const row of data ?? []) {
      const rs = (row as { routing_status?: string }).routing_status;
      if (rs === "needs_identification") tally.set("Couldn't identify the document type", (tally.get("Couldn't identify the document type") ?? 0) + 1);
      if (rs === "unrouted") tally.set("No agent owns this document type yet", (tally.get("No agent owns this document type yet") ?? 0) + 1);
      const ex = (row as { exception_fields?: { reason?: string; field?: string }[] }).exception_fields;
      for (const e of ex ?? []) {
        const r = (e.reason || e.field || "Needs review").toString();
        tally.set(r, (tally.get(r) ?? 0) + 1);
      }
    }
    const out = [...tally.entries()].map(([reason, count]) => ({
      reason, count,
      tone: /unread|ocr|fail|error/i.test(reason) ? "red" : /amount|missing|date/i.test(reason) ? "amber" : "blue",
    })) as FailureReason[];
    return out.sort((a, b) => b.count - a.count).slice(0, 12);
  } catch { return []; }
}

export async function getLearnedItems(): Promise<LearnedItem[]> {
  try {
    const c = db();
    const out: LearnedItem[] = [];
    const { data: ids } = await c.from("identifier_index")
      .select("id_kind, normalized, maps_to_kind, maps_to_value, source")
      .eq("source", "learned").order("updated_at", { ascending: false }).limit(20);
    for (const r of ids ?? []) {
      const x = r as { id_kind: string; normalized: string; maps_to_kind: string; maps_to_value: string };
      out.push({ kind: "Identifier rule", title: `${x.normalized} → ${x.maps_to_value}`, detail: `${x.id_kind} → ${x.maps_to_kind} · learned from your confirmations`, actionKind: "identifier", key: `${x.id_kind}|${x.normalized}` });
    }
    const { data: al } = await c.from("field_aliases")
      .select("canonical_name, alias_text, normalized, source").eq("source", "learned").limit(20);
    for (const r of al ?? []) {
      const x = r as { canonical_name: string; alias_text: string; normalized: string };
      out.push({ kind: "Field alias", title: `"${x.alias_text}" → ${x.canonical_name}`, detail: "learned document label mapping", actionKind: "alias", key: `${x.canonical_name}|${x.normalized}` });
    }
    const { data: v } = await c.from("vendors")
      .select("canonical_name, entity_code, auto_added").eq("auto_added", true).limit(20);
    for (const r of v ?? []) {
      const x = r as { canonical_name: string; entity_code: string | null };
      out.push({ kind: "Learned vendor", title: x.canonical_name, detail: x.entity_code ? `default entity ${x.entity_code} · auto-added` : "auto-added — confirm to lock", actionKind: "vendor", key: x.canonical_name });
    }
    return out;
  } catch { return []; }
}

export async function getRouting(): Promise<RouteRow[]> {
  try {
    const c = db();
    const [{ data: routes }, { data: types }] = await Promise.all([
      c.from("doc_type_routing").select("doc_type, agent, is_primary"),
      c.from("doc_types").select("doc_type, display_name").limit(1000),
    ]);
    const label = new Map((types ?? []).map((t) => [(t as { doc_type: string }).doc_type, (t as { display_name: string }).display_name]));
    const byType = new Map<string, string[]>();
    for (const r of routes ?? []) {
      const x = r as { doc_type: string; agent: string; is_primary: boolean };
      const arr = byType.get(x.doc_type) ?? [];
      if (x.is_primary) arr.unshift(x.agent); else arr.push(x.agent);
      byType.set(x.doc_type, arr);
    }
    return [...byType.entries()].map(([docType, agents]) => ({
      docType, label: label.get(docType) ?? docType, agents,
      status: agents.length > 1 ? "fan-out" : "routed",
    })).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 60);
  } catch { return []; }
}

export async function getKnowledgeVendors(): Promise<KnowledgeVendor[]> {
  try {
    const c = db();
    const { data } = await c.from("vendors")
      .select("canonical_name, aliases, entity_code, accepted, auto_added").limit(80);
    return (data ?? []).map((r) => {
      const x = r as { canonical_name: string; aliases: string[] | null; entity_code: string | null; accepted: boolean | null; auto_added: boolean | null };
      const source: KnowledgeVendor["source"] = x.auto_added ? "learned" : "curated";
      return { name: x.canonical_name, aliases: x.aliases ?? [], entity: x.entity_code, source };
    }).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}
