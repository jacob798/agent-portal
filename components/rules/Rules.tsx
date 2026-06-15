"use client";

import { useMemo, useState } from "react";
import type {
  FailureReason, LearnedItem, DocTypeCategory, KnowledgeVendor, LearningStats,
  ResolutionGroup, ConfidenceGate,
} from "@/lib/data/rules";

type View = "exceptions" | "learned" | "needsid" | "rules" | "routing" | "knowledge";

const AGENT_TONE: Record<string, string> = {
  travel: "bg-sky-50 text-sky-700", payables: "bg-violet-50 text-violet-700",
  valuation: "bg-emerald-50 text-emerald-700", bookkeeper: "bg-amber-50 text-amber-700",
};
const AGENTS = ["payables", "travel", "bookkeeper", "reconciliation", "valuation", "contacts", "proforma"];

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  parked:   { label: "Parked",   cls: "bg-slate-100 text-slate-500",   icon: "○" },
  in_setup: { label: "In setup", cls: "bg-amber-50 text-amber-700",    icon: "◔" },
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700", icon: "●" },
  drifting: { label: "Drifting", cls: "bg-red-50 text-red-700",         icon: "▲" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-400",    icon: "▫" },
};
function statusBadge(status: string) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.parked;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.icon} {s.label}</span>;
}

// rich-card icon by learned-item kind (mirrors the mockup's icon tiles)
function kindIcon(it: LearnedItem) {
  if (it.promote) return { ico: "⬆️", cls: "bg-violet-50" };
  switch (it.actionKind) {
    case "vendor": return { ico: "🏢", cls: "bg-sky-50" };
    case "identifier": return { ico: "🔗", cls: "bg-violet-50" };
    case "alias": return { ico: "🔤", cls: "bg-emerald-50" };
    default: return { ico: "✨", cls: "bg-slate-100" };
  }
}

export default function Rules({
  stats, report, learned, catalog, vendors, rules, gates,
}: {
  stats: LearningStats; report: FailureReason[]; learned: LearnedItem[];
  catalog: DocTypeCategory[]; vendors: KnowledgeVendor[];
  rules: ResolutionGroup[]; gates: ConfidenceGate[];
}) {
  const [view, setView] = useState<View>("learned");
  const [learnedItems, setLearnedItems] = useState(learned);
  const [busy, setBusy] = useState<string | null>(null);

  const exceptionsTotal = report.reduce((n, r) => n + r.count, 0);
  const needsId = useMemo(() => catalog.flatMap((c) => c.rows).filter((r) => r.agents.length === 0).length, [catalog]);

  async function actLearned(it: LearnedItem, action: "approve" | "reject" | "promote") {
    const tag = it.actionKind + it.key;
    setBusy(tag);
    try {
      const res = await fetch("/api/rules/learned-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: it.actionKind, key: it.key, action }),
      });
      if (res.ok) setLearnedItems((xs) => xs.filter((x) => x.actionKind + x.key !== tag));
    } finally { setBusy(null); }
  }

  const NAV: { group: string; items: { v: View; ic: string; label: string; count?: number }[] }[] = [
    { group: "Maintain", items: [
      { v: "exceptions", ic: "⚠️", label: "Exceptions", count: exceptionsTotal },
      { v: "learned", ic: "✨", label: "Learned", count: learnedItems.length },
      { v: "needsid", ic: "🆔", label: "Needs ID", count: needsId },
    ] },
    { group: "Configure", items: [
      { v: "rules", ic: "⚙️", label: "Rules & priority" },
      { v: "routing", ic: "🔀", label: "Routing" },
      { v: "knowledge", ic: "📚", label: "Knowledge" },
    ] },
  ];

  return (
    <div>
      {/* Module header */}
      <div className="flex items-center gap-3.5 border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-[16px] font-semibold leading-tight text-slate-900">Rules &amp; Learning</h1>
          <div className="text-[12.5px] text-slate-500">Maintain the system by approving what it learns — no code</div>
        </div>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Learning: ON
        </span>
      </div>

      <div className="mx-auto grid max-w-[1280px] grid-cols-[212px_1fr] gap-5 p-5">
        {/* Sidebar nav */}
        <nav className="sticky top-5 h-fit rounded-2xl border border-slate-200 bg-white p-2">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{g.group}</div>
              {g.items.map((it) => {
                const on = view === it.v;
                return (
                  <button key={it.v} onClick={() => setView(it.v)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium ${on ? "bg-[#0a2c4e] text-white" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className="w-4 text-center">{it.ic}</span>
                    <span>{it.label}</span>
                    {it.count !== undefined && (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{it.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Main */}
        <div className="min-w-0">
          {view === "learned" && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <Stat n={exceptionsTotal} l="Exceptions to clear" tone="amber" />
                <Stat n={learnedItems.length} l="Learned · pending you" tone="violet" />
                <Stat n={stats.documents} l="Documents seen" />
                <Stat n={stats.signals} l="Signal stats" tone="emerald" />
              </div>

              <Panel title="Why analysis needed review" hint="why a document didn’t auto-process — fix the top causes first">
                {report.length === 0 ? <Empty>Nothing pending — everything auto-processed.</Empty> : (
                  <div className="px-2 py-1">
                    {report.map((r) => {
                      const dest: View = /identif|type|agent|owns/i.test(r.reason) ? "routing" : /vendor/i.test(r.reason) ? "knowledge" : "exceptions";
                      const fix = dest === "routing" ? "→ Document types" : dest === "knowledge" ? "→ Vendors" : "→ Exceptions";
                      const max = Math.max(1, ...report.map((x) => x.count));
                      return (
                        <button key={r.reason} onClick={() => setView(dest)}
                          className="grid w-full grid-cols-[240px_1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                          <span className="text-[13px] font-medium text-slate-700">{r.reason}</span>
                          <span className="h-2 w-full rounded-full bg-slate-100">
                            <span className={`block h-full rounded-full ${r.tone === "red" ? "bg-red-500" : r.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${(r.count / max) * 100}%` }} />
                          </span>
                          <span className="w-8 text-right font-bold tabular-nums">{r.count}</span>
                          <span className="w-28 text-right text-[11.5px] text-blue-600">{fix}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="Learned — pending your approval" hint="approve to make live · these come from your own corrections & postings">
                {learnedItems.length === 0 ? <Empty>Nothing pending — corrections and postings will show here.</Empty> : (
                  <div className="divide-y divide-slate-100">
                    {learnedItems.map((x, i) => {
                      const tag = x.actionKind + x.key;
                      const ik = kindIcon(x);
                      return (
                        <div key={i} className="grid grid-cols-[34px_1fr_auto] items-start gap-3.5 px-4 py-4">
                          <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg text-[17px] ${ik.cls}`}>{ik.ico}</div>
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-slate-900">
                              <span className="mr-2 text-[11px] font-bold uppercase tracking-wide text-violet-600">{x.kind}</span>{x.title}
                            </div>
                            <div className="mt-1 text-[12.8px] leading-relaxed text-slate-500">{x.detail}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">✨ learned</span>
                            </div>
                          </div>
                          <div className="flex min-w-[112px] flex-col gap-2">
                            {x.promote ? (
                              <button disabled={busy === tag} onClick={() => actLearned(x, "promote")}
                                className="rounded-lg bg-violet-600 px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">⬆ Promote to global</button>
                            ) : (
                              <button disabled={busy === tag} onClick={() => actLearned(x, "approve")}
                                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">✓ Approve</button>
                            )}
                            <button disabled={busy === tag} onClick={() => actLearned(x, "reject")}
                              className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-red-600 disabled:opacity-50">Reject</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {view === "rules" && <RulesPriority groups={rules} gates={gates} />}
          {view === "routing" && <RoutingCatalog catalog={catalog} />}
          {view === "knowledge" && <KnowledgeVendors vendors={vendors} />}

          {view === "exceptions" && (
            <Panel title="Exceptions" hint="the daily queue — each correction teaches the system">
              <div className="px-5 py-8 text-[13.5px] text-slate-500">
                {exceptionsTotal} documents need a quick decision (vendor / entity / amount). These are handled in the
                agent review queues — <a href="/payables" className="font-medium text-blue-600">Payables</a> and{" "}
                <a href="/travel" className="font-medium text-blue-600">Travel</a> — where each commit teaches the system.
              </div>
            </Panel>
          )}

          {view === "needsid" && (
            <Panel title="Needs identification" hint="document types with no owning agent yet — assign once, it learns">
              <div className="px-5 py-6 text-[13.5px] text-slate-500">
                {needsId} document types are unrouted. Assign an agent in{" "}
                <button onClick={() => setView("routing")} className="font-medium text-blue-600">Routing</button> — a document
                of an unrouted type goes here rather than to a wrong guess.
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l, tone }: { n: number; l: string; tone?: "violet" | "emerald" | "amber" }) {
  const c = tone === "violet" ? "text-violet-700" : tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className={`text-[23px] font-semibold ${c}`}>{n.toLocaleString()}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{l}</div>
    </div>
  );
}
function Panel({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <span className="text-[12.5px] text-slate-500">{hint}</span>}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-[13px] text-slate-400">{children}</div>;
}

/** Rules & priority — resolution rules per decision field in the LEARNED order, with live
 *  fire/accuracy from signal_stats, plus the risk-weighted confidence gates. */
function RulesPriority({ groups, gates }: { groups: ResolutionGroup[]; gates: ConfidenceGate[] }) {
  const [field, setField] = useState<ResolutionGroup["field"]>(groups[0]?.field ?? "vendor");
  const group = groups.find((g) => g.field === field) ?? groups[0];
  return (
    <div className="space-y-4">
      <Panel
        title="Resolution rules"
        hint="how each field is decided — most-reliable first"
        right={
          <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {groups.map((g) => (
              <button key={g.field} onClick={() => setField(g.field)}
                className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${field === g.field ? "bg-[#0a2c4e] text-white" : "text-slate-500 hover:text-slate-800"}`}>{g.label}</button>
            ))}
          </div>
        }
      >
        <div className="border-b border-slate-100 bg-white px-4 py-2 text-[12px] text-slate-400">
          Order is <b className="font-semibold text-slate-500">learned</b> from your confirmations (signal accuracy). The list below is the seed order; the live accuracy is what it actually orders by.
        </div>
        <div className="divide-y divide-slate-100">
          {(group?.rules ?? []).map((r) => (
            <div key={r.signal} className="grid grid-cols-[24px_1fr_auto_44px] items-center gap-3 px-4 py-3">
              <span className="cursor-grab text-slate-300">⠿</span>
              <div>
                <div className="text-[13.5px] font-semibold text-slate-800">{r.label}{r.manual && <span className="ml-2 text-[11.5px] font-normal text-amber-600">· your rule</span>}</div>
                <div className="mt-0.5 text-[12.2px] text-slate-500">{r.desc}</div>
              </div>
              <div className="text-right text-[12px] tabular-nums text-slate-500">
                {r.fires > 0
                  ? <>fires {r.fires.toLocaleString()} · <span className="font-semibold text-slate-700">{Math.round((r.accuracy ?? 0) * 100)}%</span></>
                  : <span className="text-slate-400">no data yet</span>}
              </div>
              <span className={`mx-auto h-[22px] w-[38px] rounded-full ${r.enabled ? "bg-emerald-500" : "bg-slate-300"} relative`} title={r.enabled ? "on" : "off"}>
                <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white ${r.enabled ? "right-0.5" : "left-0.5"}`} />
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Confidence gates" hint="how sure before it auto-fills vs. asks you · risk-weighted">
        <div className="divide-y divide-slate-100">
          {gates.map((g) => (
            <div key={g.field} className="flex items-center gap-3 px-4 py-3">
              <div>
                <div className="text-[13.5px] font-semibold text-slate-800">{g.field}</div>
                {g.desc && <div className="mt-0.5 text-[12.2px] text-slate-500">{g.desc}</div>}
              </div>
              <div className="ml-auto text-[12.5px] tabular-nums text-slate-500">
                auto ≥ {g.threshold.toFixed(2)}{g.nMin ? ` · n≥${g.nMin}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Editable vendor master — set each vendor's default entity + GL inline (saves on blur). */
function KnowledgeVendors({ vendors }: { vendors: KnowledgeVendor[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(() => Object.fromEntries(vendors.map((v) => [v.name, { entity: v.entity ?? "", gl: v.gl ?? "" }])));
  const [saved, setSaved] = useState<string | null>(null);

  async function save(name: string, patch: { entity?: string; gl?: string }) {
    try {
      await fetch("/api/rules/set-vendor-defaults", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor: name, ...patch }),
      });
      setSaved(name); setTimeout(() => setSaved((s) => (s === name ? null : s)), 1500);
    } catch { /* best-effort */ }
  }

  const needle = q.trim().toLowerCase();
  const view = vendors.filter((v) => !needle || v.name.toLowerCase().includes(needle) || v.aliases.some((a) => a.toLowerCase().includes(needle)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        <span className="ml-auto text-[12.5px] text-slate-500">{view.length} of {vendors.length} vendors · entity + GL editable</span>
      </div>
      <Panel title="Knowledge — vendors" hint="master data the agents resolve against · edit a default to set it · Learned = from your corrections">
        {view.length === 0 ? <Empty>No vendors match.</Empty> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-semibold">Vendor</th><th className="px-4 py-2 font-semibold">Aliases</th>
              <th className="px-4 py-2 font-semibold">Default entity</th><th className="px-4 py-2 font-semibold">Default GL</th>
              <th className="px-4 py-2 font-semibold">Source</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {view.map((v) => {
                const r = rows[v.name] ?? { entity: "", gl: "" };
                return (
                  <tr key={v.name}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{v.name}{saved === v.name && <span className="ml-2 text-[11px] font-normal text-emerald-600">saved ✓</span>}</td>
                    <td className="px-4 py-2.5 text-slate-500">{v.aliases.join(" · ") || "—"}</td>
                    <td className="px-4 py-2.5">
                      <input value={r.entity}
                        onChange={(e) => setRows((m) => ({ ...m, [v.name]: { ...r, entity: e.target.value } }))}
                        onBlur={() => { if (r.entity !== (v.entity ?? "")) save(v.name, { entity: r.entity }); }}
                        placeholder="—" className="w-24 rounded-md border border-slate-200 px-2 py-1 text-[12.5px] uppercase" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input value={r.gl}
                        onChange={(e) => setRows((m) => ({ ...m, [v.name]: { ...r, gl: e.target.value } }))}
                        onBlur={() => { if (r.gl !== (v.gl ?? "")) save(v.name, { gl: r.gl }); }}
                        placeholder="—" className="w-56 rounded-md border border-slate-200 px-2 py-1 text-[12.5px]" />
                    </td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.source === "learned" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"}`}>{v.source === "learned" ? "✨ Learned" : "Set by you"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/**
 * Routing / document-type CATALOG — every type (no truncation), grouped by CATEGORY,
 * searchable, with per-type routing (editable), samples-seen, fields-defined, status.
 */
function RoutingCatalog({ catalog }: { catalog: DocTypeCategory[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unrouted" | "unsampled" | "sampled">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [routed, setRouted] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of catalog) for (const r of c.rows) m[r.docType] = r.agents[0] ?? "";
    return m;
  });
  const [saving, setSaving] = useState<string | null>(null);

  const totals = useMemo(() => {
    const rows = catalog.flatMap((c) => c.rows);
    return {
      types: rows.length,
      routed: rows.filter((r) => (routed[r.docType] ?? "")).length,
      sampled: rows.filter((r) => r.samples > 0).length,
      cats: catalog.length,
    };
  }, [catalog, routed]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog
      .map((c) => ({
        category: c.category,
        rows: c.rows.filter((r) => {
          if (needle && !r.label.toLowerCase().includes(needle) && !r.docType.toLowerCase().includes(needle)
              && !c.category.toLowerCase().includes(needle)) return false;
          if (filter === "unrouted") return !(routed[r.docType] ?? "");
          if (filter === "unsampled") return r.samples === 0;
          if (filter === "sampled") return r.samples > 0;
          return true;
        }),
      }))
      .filter((c) => c.rows.length > 0);
  }, [catalog, q, filter, routed]);

  async function setAgent(docType: string, agent: string) {
    setRouted((m) => ({ ...m, [docType]: agent }));
    setSaving(docType);
    try {
      await fetch("/api/rules/set-routing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, agent }),
      });
    } catch { /* best-effort */ }
    setSaving(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search document types…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        {(["all", "unrouted", "unsampled", "sampled"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"}`}>
            {f === "all" ? "All" : f === "unrouted" ? "Unrouted" : f === "unsampled" ? "No sample" : "Sampled"}</button>
        ))}
        <span className="ml-auto text-[12.5px] text-slate-500">
          {totals.types} types · {totals.cats} categories · {totals.routed} routed · {totals.sampled} sampled
        </span>
      </div>

      {view.length === 0 ? <Empty>No document types match.</Empty> : view.map((c) => {
        const isOpen = open[c.category] ?? (!!q || filter !== "all");
        const sampled = c.rows.filter((r) => r.samples > 0).length;
        return (
          <div key={c.category} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button onClick={() => setOpen((o) => ({ ...o, [c.category]: !isOpen }))}
              className="flex w-full items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left">
              <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
              <h2 className="text-sm font-semibold text-slate-900">{c.category}</h2>
              <span className="text-[12px] text-slate-500">{c.rows.length} types</span>
              {sampled > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{sampled} sampled</span>}
            </button>
            {isOpen && (
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-semibold">Document type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Routes to</th>
                  <th className="px-4 py-2 font-semibold">Fields</th>
                  <th className="px-4 py-2 font-semibold">Samples</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {c.rows.map((r) => (
                    <tr key={r.docType}>
                      <td className="px-4 py-2.5">
                        <a href={`/rules/types/${encodeURIComponent(r.docType)}`} className="font-medium text-slate-900 hover:text-blue-600">{r.label}</a>
                        <div className="text-[11px] text-slate-400">{r.docType}</div>
                      </td>
                      <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                      <td className="px-4 py-2.5">
                        <select value={routed[r.docType] ?? ""} onChange={(e) => setAgent(r.docType, e.target.value)}
                          className={`rounded-md border px-2 py-1 text-[12.5px] ${routed[r.docType] ? `border-transparent font-semibold ${AGENT_TONE[routed[r.docType]] ?? "bg-slate-100 text-slate-700"}` : "border-amber-300 text-amber-600"}`}>
                          <option value="">— unrouted —</option>
                          {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {saving === r.docType && <span className="ml-1 text-[11px] text-slate-400">saving…</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{r.fields}</td>
                      <td className="px-4 py-2.5">
                        {r.samples > 0
                          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">{r.samples} seen</span>
                          : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-600">no sample</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
