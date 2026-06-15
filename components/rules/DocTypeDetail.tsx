"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocTypeDetail } from "@/lib/data/rules";

const AGENTS = ["payables", "travel", "bookkeeper", "reconciliation", "valuation", "contacts", "proforma"];

const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  parked:   { label: "Parked",   cls: "bg-slate-100 text-slate-500",   icon: "○" },
  in_setup: { label: "In setup", cls: "bg-amber-50 text-amber-700",    icon: "◔" },
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700", icon: "●" },
  drifting: { label: "Drifting", cls: "bg-red-50 text-red-700",         icon: "▲" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-400",    icon: "▫" },
};

export default function DocTypeDetail({ detail }: { detail: DocTypeDetail }) {
  const router = useRouter();
  const [ctx, setCtx] = useState(detail.context ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ctxSaved, setCtxSaved] = useState(false);
  const st = STATUS[detail.status] ?? STATUS.parked;

  const [fields, setFields] = useState(detail.fields);
  const [newField, setNewField] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [agents, setAgents] = useState<string[]>(detail.agents ?? []);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [samplePage, setSamplePage] = useState(0);
  const SAMPLES_PER_PAGE = 8;

  async function saveAgents(next: string[]) {
    setAgents(next);
    try {
      await fetch("/api/rules/set-routing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, agents: next }),
      });
    } catch { /* best-effort */ }
  }
  const toggleAgent = (a: string) =>
    saveAgents(agents.includes(a) ? agents.filter((x) => x !== a) : [...agents, a]);

  const agentsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!agentsOpen) return;
    const onDoc = (e: MouseEvent) => { if (agentsRef.current && !agentsRef.current.contains(e.target as Node)) setAgentsOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [agentsOpen]);

  async function generate() {
    setBusy("gen"); setMsg(null);
    try {
      const r = await fetch("/api/rules/generate-type-context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType }),
      });
      setMsg(r.ok ? "Queued — the worker will draft it from samples + fields, refresh shortly." : "Couldn't queue generation.");
    } catch { setMsg("Couldn't queue generation."); }
    setBusy(null);
  }

  async function saveContext() {
    if (ctx === (detail.context ?? "")) return;
    try {
      const r = await fetch("/api/rules/set-type-context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, context: ctx }),
      });
      if (r.ok) { setCtxSaved(true); setTimeout(() => setCtxSaved(false), 1500); }
    } catch { /* best-effort */ }
  }

  async function confirmField(name: string) {
    setFields((fs) => fs.map((f) => (f.name === name ? { ...f, source: "curated" } : f)));
    try {
      await fetch("/api/rules/confirm-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, field: name }),
      });
    } catch { /* best-effort */ }
  }

  async function populateFromAgents() {
    setBusy("materialize"); setMsg(null);
    try {
      const r = await fetch("/api/rules/materialize-fields", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg(j.agents?.length
          ? `Populating from ${j.agents.join(" + ")} — the fields they need appear here in a few seconds.`
          : "This type isn't routed to an agent yet — set 'Routes to' first, then populate.");
        setTimeout(() => router.refresh(), 4000);
      } else setMsg(`Couldn't populate: ${j.error ?? r.statusText}`);
    } catch (e) { setMsg(`Couldn't populate: ${e instanceof Error ? e.message : "error"}`); }
    setBusy(null);
  }

  const [editMeta, setEditMeta] = useState(false);
  const [mLabel, setMLabel] = useState(detail.label);
  const [mCat, setMCat] = useState(detail.category);
  async function saveMeta() {
    setEditMeta(false);
    if (mLabel.trim() === detail.label && mCat.trim() === detail.category) return;
    try {
      await fetch("/api/rules/set-type-meta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, label: mLabel, category: mCat }),
      });
      router.refresh();
    } catch { /* best-effort */ }
  }

  async function removeField(name: string, scope: string) {
    setFields((fs) => fs.filter((f) => !(f.name === name && f.scope === scope)));
    try {
      await fetch("/api/rules/remove-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, field: name, scope }),
      });
    } catch { /* best-effort */ }
  }

  async function addField() {
    const name = newField.trim();
    if (!name || fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) { setNewField(""); return; }
    setFields((fs) => [...fs, { name, dataType: "text", required: newRequired, aliases: [], source: "curated", lastValue: null, scope: "document", fieldKey: null, valueSource: "document", format: null }]);
    setNewField(""); setNewRequired(false);
    try {
      await fetch("/api/rules/add-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, name, required: newRequired }),
      });
    } catch { /* best-effort */ }
  }

  const idLike = (v: string | null) => !!v && /^[A-Z]{2,6}:\d+$/.test(v);
  const sampleLabel = (s: { vendor: string | null; source: string | null }) =>
    (s.vendor && !idLike(s.vendor) ? s.vendor : s.source) || "—";
  const sampleCount = detail.samples.length;
  const pageCount = Math.max(1, Math.ceil(sampleCount / SAMPLES_PER_PAGE));
  const pageSamples = detail.samples.slice(samplePage * SAMPLES_PER_PAGE, (samplePage + 1) * SAMPLES_PER_PAGE);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-slate-400">
        <a href="/rules" className="hover:text-slate-600">Rules &amp; Learning</a>
        <span>›</span>
        <a href="/rules?tab=routing" className="hover:text-slate-600">Document types</a>
        <span>›</span>
        <span className="text-slate-600">{detail.label}</span>
      </nav>

      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              {editMeta ? (
                <input autoFocus value={mLabel} onChange={(e) => setMLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveMeta(); }}
                  className="rounded-md border border-slate-300 px-2 py-0.5 text-[19px] font-semibold text-brand-navy" />
              ) : (
                <h1 className="text-[20px] font-semibold tracking-tight text-brand-navy">{detail.label}</h1>
              )}
              <span className="font-mono text-[11px] text-slate-400">{detail.docType}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.icon} {st.label}</span>
              {editMeta
                ? <button onClick={saveMeta} className="text-[12px] font-medium text-emerald-600">save</button>
                : <button onClick={() => { setMLabel(detail.label); setMCat(detail.category); setEditMeta(true); }} className="text-[12px] text-slate-400 hover:text-slate-600">✎ rename</button>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500">
              {editMeta
                ? <input value={mCat} onChange={(e) => setMCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveMeta(); }}
                    placeholder="Category" className="rounded-md border border-slate-300 px-2 py-0.5 text-[12.5px]" />
                : <span>{detail.category}</span>}
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                Routes to
                <span ref={agentsRef} className="relative inline-block">
                  <button onClick={() => setAgentsOpen((v) => !v)}
                    className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] ${agents.length ? "border-transparent bg-sky-50" : "border-amber-300 text-amber-600"}`}>
                    {agents.length === 0 ? <span>— unrouted —</span> : agents.map((a) => (
                      <span key={a} className="font-semibold text-sky-700">{a}</span>
                    )).reduce((prev, cur, i) => i === 0 ? [cur] : [...prev, <span key={`s${i}`} className="text-sky-300">,</span>, cur], [] as React.ReactNode[])}
                    <span className="text-slate-400">▾</span>
                  </button>
                  {agentsOpen && (
                    <span className="absolute left-0 z-30 mt-1 block w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {AGENTS.map((a) => (
                        <label key={a} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-slate-50">
                          <input type="checkbox" checked={agents.includes(a)} onChange={() => toggleAgent(a)} />
                          <span>{a}</span>
                        </label>
                      ))}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-slate-300">·</span><span>{fields.length} fields</span>
              <span className="text-slate-300">·</span><span>{detail.sampleCount} samples</span>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button onClick={populateFromAgents} disabled={busy === "materialize"}
              title="Set this type's fields to exactly what its routed agents need"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-navy px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy === "materialize" ? "Populating…" : "↻ Populate fields from agents"}</button>
          </div>
        </div>
        {msg && <div className="mt-3 text-[12px] text-emerald-700">{msg}</div>}
      </div>

      {/* AI document-type context — editable + saved */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-slate-900">✨ Document type context</span>
          <span className="text-[11.5px] text-slate-400">edit freely — saves on blur</span>
          {ctxSaved && <span className="text-[11.5px] text-emerald-600">saved ✓</span>}
          <button onClick={generate} disabled={busy === "gen"}
            className="ml-auto rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-700 disabled:opacity-50">
            {busy === "gen" ? "Queuing…" : "✨ Generate with AI"}
          </button>
        </div>
        <textarea value={ctx} onChange={(e) => setCtx(e.target.value)} onBlur={saveContext} rows={4}
          className="w-full rounded-md border border-slate-200 p-2.5 text-[13.5px] leading-relaxed outline-none focus:border-blue-300"
          placeholder="No context yet — type one, or click Generate with AI to draft it from this type's samples and fields." />
        {detail.purpose && <div className="mt-1.5 text-[12px] text-slate-500">Purpose: {detail.purpose}</div>}
        {msg && <div className="mt-2 text-[12px] text-slate-600">{msg}</div>}
      </div>

      {/* Fields = the "look for" */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-[13.5px] font-semibold text-slate-900">Fields</span>
          <span className="text-[12px] text-slate-500">{fields.length} · {fields.filter((f) => f.required).length} required · = the “look for”</span>
        </div>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2 font-semibold">Field</th>
            <th className="px-4 py-2 font-semibold">Scope</th>
            <th className="px-4 py-2 font-semibold">Type</th>
            <th className="px-4 py-2 font-semibold">Labels (aliases)</th>
            <th className="px-4 py-2 font-semibold">Last captured</th>
            <th className="px-4 py-2"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {fields.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[13px] text-slate-400">No fields yet — route this type to an agent and hit “Populate fields from agents”, or add one below.</td></tr>
            )}
            {fields.slice(0, 120).map((f) => (
              <tr key={`${f.scope}:${f.name}`}>
                <td className="px-4 py-2.5">
                  <span className={f.required ? "text-red-500" : "text-slate-300"}>●</span> <span className="font-medium text-slate-800">{f.name}</span>
                  {f.fieldKey && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{f.fieldKey}</span>}
                  {f.valueSource === "derived" && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700">derived</span>}
                  {f.valueSource === "manual" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">you provide</span>}
                  {f.source === "learned" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">suggested</span>}
                </td>
                <td className="px-4 py-2.5">
                  {f.scope === "document"
                    ? <span className="text-[12px] text-slate-400">document</span>
                    : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">⛓ {f.scope}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{f.dataType}{f.format && <span className="ml-1 text-[11px] text-slate-400">· {f.format}</span>}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.aliases.length ? f.aliases.map((a) => `"${a}"`).join(", ") : "—"}</td>
                <td className="px-4 py-2.5">
                  {f.source === "learned"
                    ? <button onClick={() => confirmField(f.name)} className="text-[12px] font-medium text-emerald-600">Confirm</button>
                    : <span className="font-mono text-[11.5px] text-slate-500">{f.lastValue ?? "—"}</span>}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button onClick={() => removeField(f.name, f.scope)} title="Remove this field"
                    className="text-[13px] text-slate-300 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
            {/* add-field row */}
            <tr className="bg-slate-50/60">
              <td className="px-4 py-2.5" colSpan={3}>
                <input value={newField} onChange={(e) => setNewField(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addField(); }}
                  placeholder="Add a field (e.g. policy_number)…"
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-blue-300" />
              </td>
              <td className="px-4 py-2.5">
                <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} /> required
                </label>
              </td>
              <td className="px-4 py-2.5">
                <button onClick={addField} disabled={!newField.trim()}
                  className="rounded-md bg-brand-navy px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">+ Add field</button>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sample documents — collapsible + paginated */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button onClick={() => setSamplesOpen((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left">
          <span className="text-slate-400">{samplesOpen ? "▾" : "▸"}</span>
          <span className="text-[13.5px] font-semibold text-slate-900">Sample documents</span>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{detail.sampleCount}</span>
          <span className="ml-auto text-[12px] text-slate-400">real documents we&apos;ve seen of this type</span>
        </button>
        {samplesOpen && (
          detail.samples.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">No documents of this type yet.</div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Outcome</th>
                  <th className="px-4 py-2 text-right font-semibold">Document</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSamples.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="w-32 px-4 py-2.5 text-slate-500">{s.date ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{sampleLabel(s)}</td>
                      <td className="px-4 py-2.5">
                        {s.outcome === "auto"
                          ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">auto-processed</span>
                          : s.outcome === "review"
                          ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">needed review</span>
                          : <span className="text-[12px] text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {s.url
                          ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium text-blue-600">Open ↗</a>
                          : <span className="text-[12px] text-slate-300" title={s.path ?? "not filed to Dropbox"}>not filed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pageCount > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
                  <span>{samplePage * SAMPLES_PER_PAGE + 1}–{Math.min((samplePage + 1) * SAMPLES_PER_PAGE, sampleCount)} of {sampleCount}{detail.sampleCount > sampleCount ? ` (newest ${sampleCount})` : ""}</span>
                  <span className="flex gap-1">
                    <button disabled={samplePage === 0} onClick={() => setSamplePage((p) => Math.max(0, p - 1))}
                      className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">‹ Prev</button>
                    <button disabled={samplePage >= pageCount - 1} onClick={() => setSamplePage((p) => Math.min(pageCount - 1, p + 1))}
                      className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40">Next ›</button>
                  </span>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
