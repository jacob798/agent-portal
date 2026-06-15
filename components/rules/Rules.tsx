"use client";

import { useMemo, useState } from "react";
import type { FailureReason, LearnedItem, DocTypeCategory, KnowledgeVendor, LearningStats } from "@/lib/data/rules";

type Tab = "learned" | "report" | "routing" | "knowledge";

const AGENT_TONE: Record<string, string> = {
  travel: "bg-sky-50 text-sky-700", payables: "bg-violet-50 text-violet-700",
  valuation: "bg-emerald-50 text-emerald-700", bookkeeper: "bg-amber-50 text-amber-700",
};
// agents a doc type can be routed to (current + planned)
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

export default function Rules({
  stats, report, learned, catalog, vendors,
}: {
  stats: LearningStats; report: FailureReason[]; learned: LearnedItem[];
  catalog: DocTypeCategory[]; vendors: KnowledgeVendor[];
}) {
  const [tab, setTab] = useState<Tab>("learned");
  const [learnedItems, setLearnedItems] = useState(learned);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewKind, setReviewKind] = useState("all");
  const maxN = Math.max(1, ...report.map((r) => r.count));

  async function actLearned(it: LearnedItem, action: "approve" | "reject") {
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

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Rules &amp; Learning</h1>
          <p className="text-sm text-slate-500">Maintain the system by reviewing what it learns — no code.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Learning: ON
        </span>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <Stat n={stats.documents} l="Documents seen" />
        <Stat n={stats.predictions} l="Predictions" />
        <Stat n={stats.learnedIdentifiers} l="Learned identifiers" tone="violet" />
        <Stat n={stats.signals} l="Signal stats" tone="emerald" />
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {([["learned", "Learned"], ["report", "Why review"], ["routing", "Routing"], ["knowledge", "Knowledge"]] as [Tab, string][]).map(
          ([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${tab === t ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}>
              {l}
            </button>
          ),
        )}
      </div>

      {tab === "report" && (
        <Panel title="Why analysis needed review" hint="why a document didn't auto-process — fix the top causes first">
          {report.length === 0 ? <Empty>Nothing pending — everything auto-processed.</Empty> : (
            <div className="divide-y divide-slate-100">
              {report.map((r) => {
                const dest: Tab = /identif|type|agent|owns/i.test(r.reason) ? "routing" : /vendor/i.test(r.reason) ? "knowledge" : "learned";
                const fix = dest === "routing" ? "→ Document types" : dest === "knowledge" ? "→ Vendors" : "→ Review";
                return (
                  <button key={r.reason} onClick={() => setTab(dest)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5 text-left hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span className="w-56 shrink-0 text-[13px] text-slate-700">{r.reason}</span>
                      <div className="h-2 w-full max-w-xs rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${r.tone === "red" ? "bg-red-500" : r.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`}
                          style={{ width: `${(r.count / maxN) * 100}%` }} />
                      </div>
                    </div>
                    <span className="flex items-center gap-3 text-right">
                      <span className="text-[11.5px] text-blue-600">{fix}</span>
                      <span className="font-semibold tabular-nums">{r.count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {tab === "learned" && (() => {
        const kinds = ["all", ...Array.from(new Set(learnedItems.map((x) => x.kind)))];
        const shown = learnedItems.filter((x) => reviewKind === "all" || x.kind === reviewKind);
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {kinds.map((k) => (
                <button key={k} onClick={() => setReviewKind(k)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${reviewKind === k ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:text-slate-900"}`}>
                  {k === "all" ? `All ${learnedItems.length}` : `${k} ${learnedItems.filter((x) => x.kind === k).length}`}
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {shown.length === 0 ? <Empty>Nothing pending — corrections and postings will show here.</Empty> : (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-semibold">What was learned</th>
                    <th className="px-4 py-2 font-semibold">Kind</th>
                    <th className="px-4 py-2 font-semibold">From</th>
                    <th className="px-4 py-2 text-right font-semibold">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((x, i) => {
                      const tag = x.actionKind + x.key;
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">{x.title}</td>
                          <td className="px-4 py-2.5"><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{x.kind}</span></td>
                          <td className="px-4 py-2.5 text-slate-500">{x.detail}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <button disabled={busy === tag} onClick={() => actLearned(x, "approve")}
                              className="mr-3 font-semibold text-emerald-600 disabled:opacity-50" title="Approve">✓</button>
                            <button disabled={busy === tag} onClick={() => actLearned(x, "reject")}
                              className="font-semibold text-red-600 disabled:opacity-50" title="Reject">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "routing" && <RoutingCatalog catalog={catalog} />}

      {tab === "knowledge" && <KnowledgeVendors vendors={vendors} />}
    </div>
  );
}

function Stat({ n, l, tone }: { n: number; l: string; tone?: "violet" | "emerald" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className={`text-[22px] font-semibold ${tone === "violet" ? "text-violet-700" : tone === "emerald" ? "text-emerald-600" : "text-slate-900"}`}>{n.toLocaleString()}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{l}</div>
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-[12.5px] text-slate-500">{hint}</span>
      </div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-[13px] text-slate-400">{children}</div>;
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
 * Routing / document-type CATALOG — the redesign. Every type (no truncation), grouped by
 * CATEGORY (500 types need navigation), searchable, with per-type routing (editable),
 * samples-seen, and fields-defined. Surfaces the three states: routed · fields · sampled.
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
