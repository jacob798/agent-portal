/**
 * Rules & Learning console data — reads the LIVE learning + routing tables the agent
 * populates (documents, predictions, signal_stats, identifier_index, field_aliases,
 * doc_type_routing, doc_types, vendors). Admin (service-role) reads; every function is
 * defensive (returns empty on error) so the page never breaks.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface FailureReason { reason: string; count: number; tone: "blue" | "amber" | "red" }
export interface LearnedItem { kind: string; title: string; detail: string; actionKind: "vendor" | "identifier" | "alias"; key: string; promote?: boolean }
export interface RouteRow { docType: string; label: string; agents: string[]; status: string }
/** A document type in the catalog — the unit the routing/setup console manages. */
export interface DocTypeRow {
  docType: string;
  label: string;
  category: string;      // group header (500 types need categories to navigate)
  agents: string[];      // owning agent(s); [] = unrouted
  samples: number;       // real documents of this type we've actually seen
  fields: number;        // fields defined in the spec
  status: string;        // parked | in_setup | active | drifting | archived
}
export interface DocTypeCategory { category: string; rows: DocTypeRow[] }
export interface KnowledgeVendor { name: string; aliases: string[]; entity: string | null; gl: string | null; source: "learned" | "curated" | "synced" }
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
      .select("canonical_name, alias_text, normalized, scope, scope_key, source").eq("source", "learned").limit(200);
    type Al = { canonical_name: string; alias_text: string; normalized: string; scope: string | null; scope_key: string | null };
    // Pooled-alias promotion (P-E): a learned alias seen across MULTIPLE vendor/type scopes is a
    // candidate to promote to GLOBAL — surface those first, distinct from one-off aliases.
    const pooled = new Map<string, { canonical: string; alias: string; scopes: Set<string> }>();
    for (const r of (al ?? []) as Al[]) {
      if (!r.scope || r.scope === "global") continue;
      const k = `${r.canonical_name}|${r.normalized}`;
      const e = pooled.get(k) ?? { canonical: r.canonical_name, alias: r.alias_text, scopes: new Set<string>() };
      e.scopes.add(`${r.scope}:${r.scope_key ?? ""}`);
      pooled.set(k, e);
    }
    const promoted = new Set<string>();
    for (const [k, e] of pooled) {
      if (e.scopes.size >= 2) {
        promoted.add(k);
        out.push({ kind: "Promote to global", title: `"${e.alias}" → ${e.canonical}`, detail: `seen across ${e.scopes.size} vendors/types — promote to apply everywhere`, actionKind: "alias", key: k, promote: true });
      }
    }
    const seenAlias = new Set<string>();
    for (const r of (al ?? []) as Al[]) {
      const k = `${r.canonical_name}|${r.normalized}`;
      if (promoted.has(k) || seenAlias.has(k)) continue;
      seenAlias.add(k);
      out.push({ kind: "Field alias", title: `"${r.alias_text}" → ${r.canonical_name}`, detail: "learned document label mapping", actionKind: "alias", key: k });
      if (seenAlias.size >= 20) break;
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

/** The FULL document-type catalog, grouped by category — every type (no truncation), with
 *  its routing, how many real samples we've seen, and how many fields are defined. This is
 *  the routing/setup console's data: navigate by category, see what's unrouted / unsampled. */
export async function getDocTypeCatalog(): Promise<DocTypeCategory[]> {
  try {
    const c = db();
    const [types, routes, fieldRows, docRows] = await Promise.all([
      c.from("doc_types").select("doc_type, display_name, category, status").limit(2000),
      c.from("doc_type_routing").select("doc_type, agent, is_primary"),
      c.from("doc_type_fields").select("doc_type").limit(20000),
      c.from("documents").select("doc_type").not("doc_type", "is", null).limit(20000),
    ]);
    const agentsBy = new Map<string, string[]>();
    for (const r of routes.data ?? []) {
      const x = r as { doc_type: string; agent: string; is_primary: boolean };
      const arr = agentsBy.get(x.doc_type) ?? [];
      if (x.is_primary) arr.unshift(x.agent); else arr.push(x.agent);
      agentsBy.set(x.doc_type, arr);
    }
    const countBy = (rows: { doc_type: string }[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.doc_type, (m.get(r.doc_type) ?? 0) + 1);
      return m;
    };
    const fieldsBy = countBy(fieldRows.data as { doc_type: string }[] | null);
    const samplesBy = countBy(docRows.data as { doc_type: string }[] | null);

    const rows: DocTypeRow[] = (types.data ?? []).map((t) => {
      const x = t as { doc_type: string; display_name: string; category: string | null; status: string | null };
      return {
        docType: x.doc_type, label: x.display_name || x.doc_type,
        category: x.category || "Uncategorized", agents: agentsBy.get(x.doc_type) ?? [],
        samples: samplesBy.get(x.doc_type) ?? 0, fields: fieldsBy.get(x.doc_type) ?? 0,
        status: x.status || "parked",
      };
    });
    const byCat = new Map<string, DocTypeRow[]>();
    for (const r of rows) { const a = byCat.get(r.category) ?? []; a.push(r); byCat.set(r.category, a); }
    return [...byCat.entries()]
      .map(([category, rs]) => ({ category, rows: rs.sort((a, b) => a.label.localeCompare(b.label)) }))
      .sort((a, b) => {  // sampled categories first (most actionable), then size, then alpha
        const sa = a.rows.reduce((n, r) => n + (r.samples > 0 ? 1 : 0), 0);
        const sb = b.rows.reduce((n, r) => n + (r.samples > 0 ? 1 : 0), 0);
        return sb - sa || b.rows.length - a.rows.length || a.category.localeCompare(b.category);
      });
  } catch { return []; }
}

export async function getKnowledgeVendors(): Promise<KnowledgeVendor[]> {
  try {
    const c = db();
    const { data } = await c.from("vendors")
      .select("canonical_name, aliases, entity_code, gl_full_name, accepted, auto_added").limit(200);
    return (data ?? []).map((r) => {
      const x = r as { canonical_name: string; aliases: string[] | null; entity_code: string | null; gl_full_name: string | null; accepted: boolean | null; auto_added: boolean | null };
      const source: KnowledgeVendor["source"] = x.auto_added ? "learned" : "curated";
      return { name: x.canonical_name, aliases: x.aliases ?? [], entity: x.entity_code, gl: x.gl_full_name, source };
    }).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
}

/** A resolution rule (signal→outcome) in the LEARNED priority order, with its live fire stats. */
export interface ResolutionRule { signal: string; label: string; desc: string; fires: number; accuracy: number | null; enabled: boolean; manual?: boolean }
export interface ResolutionGroup { field: "vendor" | "entity" | "gl"; label: string; rules: ResolutionRule[] }
export interface ConfidenceGate { field: string; desc: string; threshold: number; nMin: number | null }

// Canonical signal catalog per decision field — mirrors agents/payables/core/vendor_resolution.py
// SEED_ORDER and the multi-signal entity/GL priority (CLAUDE.md). The DISPLAY order is the seed
// default; live accuracy from signal_stats is what the system actually orders by (LEARNED).
const SIGNAL_CATALOG: Record<ResolutionGroup["field"], { label: string; signals: { kind: string; label: string; desc: string; manual?: boolean }[] }> = {
  vendor: { label: "Vendor", signals: [
    { kind: "sender_domain", label: "Sender domain → vendor", desc: "the email's real sender (e.g. alaskaair.com) — hard to fake" },
    { kind: "model_named_known", label: "Model named a known vendor", desc: "the read matches a vendor we already know" },
    { kind: "doc_position", label: "Name position in document", desc: "the biller at the top of the page" },
    { kind: "fingerprint", label: "Learned fingerprint", desc: "filename / account # / past patterns" },
  ] },
  entity: { label: "Entity", signals: [
    { kind: "trip", label: "Trip context", desc: "the charge falls inside a known trip's window" },
    { kind: "property_address", label: "Ship-to / property address", desc: "the address on the invoice maps to an entity" },
    { kind: "invoice", label: "Invoice / email content", desc: "language on the document names the entity" },
    { kind: "vendor", label: "Vendor default", desc: "this vendor's learned default entity" },
    { kind: "card", label: "Payment card", desc: "secondary only — never decides entity alone" },
  ] },
  gl: { label: "GL account", signals: [
    { kind: "vendor", label: "Vendor history", desc: "what this vendor has coded to before" },
    { kind: "line_item", label: "Line-item content", desc: "what was actually purchased (split per line)" },
    { kind: "trip", label: "Trip context", desc: "travel GL when attached to a trip" },
  ] },
};

const CONFIDENCE_GATES: ConfidenceGate[] = [
  { field: "Entity", desc: "expensive to get wrong → high bar", threshold: 0.97, nMin: 3 },
  { field: "GL account", desc: "", threshold: 0.95, nMin: 3 },
  { field: "Vendor", desc: "", threshold: 0.90, nMin: null },
  { field: "Memo", desc: "cosmetic → low bar", threshold: 0.60, nMin: null },
];

export function getConfidenceGates(): ConfidenceGate[] { return CONFIDENCE_GATES; }

/** Resolution rules per decision field, overlaid with LIVE fire counts + accuracy from
 *  signal_stats (the learned priority). Order shown = seed default; accuracy is the truth. */
export async function getResolutionRules(): Promise<ResolutionGroup[]> {
  let statsByField = new Map<string, Map<string, { fires: number; agree: number }>>();
  try {
    const c = db();
    const { data } = await c.from("signal_stats").select("field, signal_kind, agree_count, total_count").limit(5000);
    for (const r of data ?? []) {
      const x = r as { field: string; signal_kind: string; agree_count: number; total_count: number };
      const m = statsByField.get(x.field) ?? new Map();
      const e = m.get(x.signal_kind) ?? { fires: 0, agree: 0 };
      e.fires += x.total_count ?? 0; e.agree += x.agree_count ?? 0;
      m.set(x.signal_kind, e); statsByField.set(x.field, m);
    }
  } catch { statsByField = new Map(); }
  return (Object.keys(SIGNAL_CATALOG) as ResolutionGroup["field"][]).map((field) => {
    const cat = SIGNAL_CATALOG[field];
    const fm = statsByField.get(field) ?? new Map();
    return {
      field, label: cat.label,
      rules: cat.signals.map((s) => {
        const st = fm.get(s.kind);
        return {
          signal: s.kind, label: s.label, desc: s.desc, manual: s.manual,
          fires: st?.fires ?? 0,
          accuracy: st && st.fires > 0 ? st.agree / st.fires : null,
          enabled: true,
        };
      }),
    };
  });
}

export interface DocTypeField { name: string; dataType: string; required: boolean; aliases: string[]; source: string; lastValue: string | null; scope: string; fieldKey: string | null }
export interface DocTypeSample { id: string; date: string | null; vendor: string | null; source: string | null; url: string | null; path: string | null }
export interface DocTypeDetail {
  docType: string; label: string; category: string; status: string;
  agent: string | null; purpose: string | null; context: string | null;
  fields: DocTypeField[]; samples: DocTypeSample[]; sampleCount: number;
}

/** Full detail for one document type: AI context, fields (the "look for"), and real samples. */
export async function getDocTypeDetail(docType: string): Promise<DocTypeDetail | null> {
  try {
    const c = db();
    const [{ data: t }, { data: route }, { data: fields }, { data: aliases }, { data: samples }, { count }] =
      await Promise.all([
        c.from("doc_types").select("doc_type, display_name, category, status, purpose, context_template").eq("doc_type", docType).maybeSingle(),
        c.from("doc_type_routing").select("agent").eq("doc_type", docType).eq("is_primary", true).maybeSingle(),
        c.from("doc_type_fields").select("canonical_name, required, source, last_value, scope, field_key").eq("doc_type", docType),
        c.from("field_aliases").select("canonical_name, alias_text").eq("scope", "type").eq("scope_key", docType),
        c.from("documents").select("document_id, vendor_id, source, updated_at, dropbox_path").eq("doc_type", docType).order("updated_at", { ascending: false }).limit(25),
        c.from("documents").select("*", { count: "exact", head: true }).eq("doc_type", docType),
      ]);
    if (!t) return null;
    const tt = t as { doc_type: string; display_name: string; category: string | null; status: string | null; purpose: string | null; context_template: string | null };
    const aliasBy = new Map<string, string[]>();
    for (const a of aliases ?? []) {
      const x = a as { canonical_name: string; alias_text: string };
      const arr = aliasBy.get(x.canonical_name) ?? []; arr.push(x.alias_text); aliasBy.set(x.canonical_name, arr);
    }
    // data_type lives in field_dictionary (NOT doc_type_fields) — look it up by name.
    const names = [...new Set((fields ?? []).map((f) => (f as { canonical_name: string | null }).canonical_name).filter(Boolean) as string[])];
    const dtByName = new Map<string, string>();
    if (names.length) {
      const { data: fd } = await c.from("field_dictionary").select("canonical_name, data_type").in("canonical_name", names);
      for (const r of fd ?? []) {
        const x = r as { canonical_name: string; data_type: string | null };
        if (x.data_type) dtByName.set(x.canonical_name, x.data_type);
      }
    }
    const seen = new Set<string>();
    const fieldRows: DocTypeField[] = [];
    for (const f of fields ?? []) {
      const x = f as { canonical_name: string; required: boolean | null; source: string | null; last_value: string | null; scope: string | null; field_key: string | null };
      const scope = x.scope || "document";
      const dedup = `${scope}:${x.canonical_name}`;   // a field is unique per (scope, name)
      if (!x.canonical_name || seen.has(dedup)) continue;
      seen.add(dedup);
      fieldRows.push({ name: x.canonical_name, dataType: dtByName.get(x.canonical_name) || "text", required: !!x.required, aliases: aliasBy.get(x.canonical_name) ?? [], source: x.source || "curated", lastValue: x.last_value ?? null, scope, fieldKey: x.field_key ?? null });
    }
    // Clickable samples: the REAL documents of this type are the payables_queue rows — they
    // carry the shareable doc_url directly, so the operator can open each one. (The learning
    // `documents` mirror often has no share link, which is why samples weren't clickable.)
    let sampleRows: DocTypeSample[] = [];
    let pqCount = 0;
    try {
      const { data: pq, count: pc } = await c
        .from("payables_queue")
        .select("id, vendor, vendor_display, doc_url, doc_path, created_at", { count: "exact" })
        .eq("doc_type", docType)
        .order("created_at", { ascending: false })
        .limit(25);
      pqCount = pc ?? 0;
      sampleRows = (pq ?? []).map((s) => {
        const x = s as { id: string; vendor: string | null; vendor_display: string | null; doc_url: string | null; doc_path: string | null; created_at: string | null };
        return {
          id: x.id, date: x.created_at ? x.created_at.slice(0, 10) : null,
          vendor: x.vendor_display || x.vendor, source: null,
          path: x.doc_path ?? null, url: x.doc_url ?? null,
        };
      });
    } catch { sampleRows = []; }
    // fall back to the learning `documents` mirror only if there are no payables rows
    if (sampleRows.length === 0) {
      sampleRows = (samples ?? []).map((s) => {
        const x = s as { document_id: string; vendor_id: string | null; source: string | null; updated_at: string | null; dropbox_path: string | null };
        return {
          id: x.document_id, date: x.updated_at ? x.updated_at.slice(0, 10) : null,
          vendor: x.vendor_id, source: x.source, path: x.dropbox_path ?? null, url: null,
        };
      });
    }
    return {
      docType: tt.doc_type, label: tt.display_name || tt.doc_type, category: tt.category || "Uncategorized",
      status: tt.status || "parked", agent: (route as { agent?: string } | null)?.agent ?? null,
      purpose: tt.purpose, context: tt.context_template,
      fields: fieldRows.sort((a, b) =>
        (a.scope === "document" ? 0 : 1) - (b.scope === "document" ? 0 : 1)
        || a.scope.localeCompare(b.scope)
        || Number(b.required) - Number(a.required) || a.name.localeCompare(b.name)),
      samples: sampleRows, sampleCount: pqCount || count || sampleRows.length,
    };
  } catch {
    return null;
  }
}
