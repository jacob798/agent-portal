"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FailureReason, LearnedItem, DocTypeCategory, DocTypeRow, KnowledgeVendor, LearningStats,
  ResolutionGroup, ConfidenceGate,
} from "@/lib/data/rules";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import FilterTabs from "@/components/ui/FilterTabs";

type Tab = "learned" | "report" | "rules" | "routing" | "knowledge";
const TABS: { key: Tab; label: string }[] = [
  { key: "learned", label: "Learned" },
  { key: "report", label: "Why review" },
  { key: "rules", label: "Rules & priority" },
  { key: "routing", label: "Routing" },
  { key: "knowledge", label: "Knowledge" },
];

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
  const [tab, setTab] = useState<Tab>("learned");
  const [learnedItems, setLearnedItems] = useState(learned);
  const [busy, setBusy] = useState<string | null>(null);

  // L4: remember which tab we were on across navigation into a document type and back.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);
  function go(t: Tab) {
    setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    window.history.replaceState(null, "", u);
  }

  const exceptionsTotal = report.reduce((n, r) => n + r.count, 0);

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="Rules & Learning"
        subtitle="Maintain the system by approving what it learns — no code."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Learning: ON
          </span>
        }
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <Stat label="To approve" value={learnedItems.length} tone="brand" />
        <Stat label="Needs review (30d)" value={exceptionsTotal} tone="amber" />
        <Stat label="Documents seen" value={stats.documents.toLocaleString()} tone="navy" />
        <Stat label="Learned signals" value={stats.signals.toLocaleString()} tone="green" />
      </div>

      <div className="mt-5">
        <FilterTabs active={tab} onChange={(k) => go(k as Tab)} tabs={TABS} />
      </div>

      <div className="mt-5">
        {tab === "learned" && (
          <div className="space-y-4">
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
                          <span className="mt-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">✨ learned</span>
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

        {tab === "report" && (
          <Panel title="Why analysis needed review" hint="why a document didn’t auto-process — click a cause to fix it">
            {report.length === 0 ? <Empty>Nothing pending — everything auto-processed.</Empty> : (
              <div className="px-2 py-1">
                {report.map((r) => {
                  const dest: Tab = /identif|type|agent|owns/i.test(r.reason) ? "routing" : /vendor/i.test(r.reason) ? "knowledge" : "learned";
                  const fix = dest === "routing" ? "→ Routing" : dest === "knowledge" ? "→ Vendors" : "→ Learned";
                  const max = Math.max(1, ...report.map((x) => x.count));
                  return (
                    <button key={r.reason} onClick={() => go(dest)}
                      className="grid w-full grid-cols-[240px_1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                      <span className="text-[13px] font-medium text-slate-700">{r.reason}</span>
                      <span className="h-2 w-full rounded-full bg-slate-100">
                        <span className={`block h-full rounded-full ${r.tone === "red" ? "bg-red-500" : r.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${(r.count / max) * 100}%` }} />
                      </span>
                      <span className="w-8 text-right font-bold tabular-nums">{r.count}</span>
                      <span className="w-24 text-right text-[11.5px] text-blue-600">{fix}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        )}

        {tab === "rules" && <RulesPriority groups={rules} gates={gates} />}
        {tab === "routing" && <RoutingCatalog catalog={catalog} />}
        {tab === "knowledge" && <KnowledgeVendors vendors={vendors} />}
      </div>
    </div>
  );
}

function Panel({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
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

/** Sortable column header. */
function SortHead<T extends string>({ label, col, sort, onSort, align }: {
  label: string; col: T; sort: { col: T; dir: 1 | -1 }; onSort: (c: T) => void; align?: "right";
}) {
  const on = sort.col === col;
  return (
    <th className={`px-4 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={() => onSort(col)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}<span className={on ? "text-slate-600" : "text-slate-300"}>{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

/** Rules & priority — resolution rules per decision field in the LEARNED order + confidence gates. */
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
                className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${field === g.field ? "bg-brand-navy text-white" : "text-slate-500 hover:text-slate-800"}`}>{g.label}</button>
            ))}
          </div>
        }
      >
        <div className="border-b border-slate-100 px-5 py-2 text-[12px] text-slate-400">
          Order is <b className="font-semibold text-slate-500">learned</b> from your confirmations (signal accuracy). This is the seed order; live accuracy is what it actually orders by.
        </div>
        <div className="divide-y divide-slate-100">
          {(group?.rules ?? []).map((r) => (
            <div key={r.signal} className="grid grid-cols-[1fr_auto_44px] items-center gap-3 px-5 py-3">
              <div>
                <div className="text-[13.5px] font-semibold text-slate-800">{r.label}{r.manual && <span className="ml-2 text-[11.5px] font-normal text-amber-600">· your rule</span>}</div>
                <div className="mt-0.5 text-[12.2px] text-slate-500">{r.desc}</div>
              </div>
              <div className="text-right text-[12px] tabular-nums text-slate-500">
                {r.fires > 0
                  ? <>fires {r.fires.toLocaleString()} · <span className="font-semibold text-slate-700">{Math.round((r.accuracy ?? 0) * 100)}%</span></>
                  : <span className="text-slate-400">no data yet</span>}
              </div>
              <span className={`relative mx-auto h-[22px] w-[38px] rounded-full ${r.enabled ? "bg-emerald-500" : "bg-slate-300"}`} title={r.enabled ? "on" : "off"}>
                <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white ${r.enabled ? "right-0.5" : "left-0.5"}`} />
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Confidence gates" hint="how sure before it auto-fills vs. asks you · risk-weighted">
        <div className="divide-y divide-slate-100">
          {gates.map((g) => (
            <div key={g.field} className="flex items-center gap-3 px-5 py-3">
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
      <Panel title="Vendors" hint="master data the agents resolve against · edit a default to set it · Learned = from your corrections">
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

/** Multi-agent "Routes to" picker (fan-out, L5). Chips + a checkbox popover; stops row-click. */
function AgentMultiSelect({ selected, onToggle }: { selected: string[]; onToggle: (a: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)}
        className={`flex flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-[12px] ${selected.length ? "border-slate-200" : "border-amber-300 text-amber-600"}`}>
        {selected.length === 0 ? <span>— unrouted —</span> : selected.map((a) => (
          <span key={a} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${AGENT_TONE[a] ?? "bg-slate-100 text-slate-700"}`}>{a}</span>
        ))}
        <span className="text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {AGENTS.map((a) => (
            <label key={a} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(a)} onChange={() => onToggle(a)} />
              <span>{a}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type RouteSortCol = "label" | "category" | "status" | "agent" | "fields" | "samples";

/**
 * Routing / document-type catalog — a FLAT, SORTABLE table with a CATEGORY FILTER (L5/L6).
 * Search + category + state filter narrow it; every column header sorts.
 */
function RoutingCatalog({ catalog }: { catalog: DocTypeCategory[] }) {
  const allRows = useMemo(() => catalog.flatMap((c) => c.rows), [catalog]);
  const categories = useMemo(() => Array.from(new Set(allRows.map((r) => r.category))).sort(), [allRows]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [state, setState] = useState<"all" | "unrouted" | "unsampled" | "sampled">("all");
  const [sort, setSort] = useState<{ col: RouteSortCol; dir: 1 | -1 }>({ col: "samples", dir: -1 });
  // Routing supports FAN-OUT: a type can be owned by several agents (L5).
  const [routed, setRouted] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(allRows.map((r) => [r.docType, [...r.agents]])));
  const [saving, setSaving] = useState<string | null>(null);
  const router = useRouter();

  // + Add type
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newAgent, setNewAgent] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  async function addType() {
    const label = newLabel.trim();
    if (!label) return;
    setAddBusy(true); setAddErr(null);
    try {
      const r = await fetch("/api/rules/add-type", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, category: newCat.trim() || undefined, agents: newAgent ? [newAgent] : [] }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) router.push(`/rules/types/${encodeURIComponent(j.docType)}?tab=routing`);
      else setAddErr(j.error ?? "Couldn't create type");
    } catch (e) { setAddErr(e instanceof Error ? e.message : "error"); }
    setAddBusy(false);
  }

  const onSort = (c: RouteSortCol) => setSort((s) => (s.col === c ? { col: c, dir: (s.dir === 1 ? -1 : 1) } : { col: c, dir: 1 }));

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = allRows.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (needle && !r.label.toLowerCase().includes(needle) && !r.docType.toLowerCase().includes(needle)) return false;
      if (state === "unrouted") return (routed[r.docType] ?? []).length === 0;
      if (state === "unsampled") return r.samples === 0;
      if (state === "sampled") return r.samples > 0;
      return true;
    });
    const key = (r: DocTypeRow): string | number =>
      sort.col === "label" ? r.label.toLowerCase()
      : sort.col === "category" ? r.category.toLowerCase()
      : sort.col === "status" ? r.status
      : sort.col === "agent" ? ((routed[r.docType] ?? [])[0] ?? "")
      : sort.col === "fields" ? r.fields
      : r.samples;
    return [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka < kb) return -1 * sort.dir;
      if (ka > kb) return 1 * sort.dir;
      return a.label.localeCompare(b.label);
    });
  }, [allRows, q, cat, state, sort, routed]);

  const sampled = allRows.filter((r) => r.samples > 0).length;
  const routedN = allRows.filter((r) => (routed[r.docType] ?? []).length > 0).length;

  async function saveAgents(docType: string, agents: string[]) {
    setRouted((m) => ({ ...m, [docType]: agents }));
    setSaving(docType);
    try {
      await fetch("/api/rules/set-routing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, agents }),
      });
    } catch { /* best-effort */ }
    setSaving(null);
  }
  const toggleAgent = (docType: string, agent: string) => {
    const cur = routed[docType] ?? [];
    saveAgents(docType, cur.includes(agent) ? cur.filter((a) => a !== agent) : [...cur, agent]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search document types…"
          className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(["all", "unrouted", "unsampled", "sampled"] as const).map((f) => (
          <button key={f} onClick={() => setState(f)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${state === f ? "bg-brand-navy text-white" : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"}`}>
            {f === "all" ? "All" : f === "unrouted" ? "Unrouted" : f === "unsampled" ? "No sample" : "Sampled"}</button>
        ))}
        <button onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-brand-navy px-3 py-1.5 text-[13px] font-semibold text-white">+ Add type</button>
        <span className="ml-auto text-[12.5px] text-slate-500">{view.length} shown · {allRows.length} types · {routedN} routed · {sampled} sampled</span>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
            placeholder="New type name (e.g. Train confirmation)"
            className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category (e.g. Travel & Misc)"
            className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <select value={newAgent} onChange={(e) => setNewAgent(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-700">
            <option value="">Route to… (optional)</option>
            {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={addType} disabled={!newLabel.trim() || addBusy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {addBusy ? "Creating…" : "Create"}</button>
          <button onClick={() => { setAdding(false); setAddErr(null); }} className="text-[13px] text-slate-500">Cancel</button>
          {newLabel.trim() && <span className="text-[11.5px] text-slate-400">slug: {newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}</span>}
          {addErr && <span className="text-[12px] text-red-600">{addErr}</span>}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
            <SortHead label="Document type" col="label" sort={sort} onSort={onSort} />
            <SortHead label="Category" col="category" sort={sort} onSort={onSort} />
            <SortHead label="Status" col="status" sort={sort} onSort={onSort} />
            <SortHead label="Routes to" col="agent" sort={sort} onSort={onSort} />
            <SortHead label="Fields" col="fields" sort={sort} onSort={onSort} align="right" />
            <SortHead label="Samples" col="samples" sort={sort} onSort={onSort} align="right" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {view.length === 0 ? (
              <tr><td colSpan={6}><Empty>No document types match.</Empty></td></tr>
            ) : view.map((r) => (
              <tr key={r.docType}
                onClick={() => router.push(`/rules/types/${encodeURIComponent(r.docType)}?tab=routing`)}
                className="cursor-pointer hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <div className="text-[11px] text-slate-400">{r.docType}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{r.category}</td>
                <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                <td className="px-4 py-2.5">
                  <AgentMultiSelect selected={routed[r.docType] ?? []} onToggle={(a) => toggleAgent(r.docType, a)} />
                  {saving === r.docType && <span className="ml-1 text-[11px] text-slate-400">saving…</span>}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{r.fields}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.samples > 0
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">{r.samples}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
