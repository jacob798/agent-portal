"use client";

import { useState } from "react";
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
  const [copied, setCopied] = useState(false);
  const st = STATUS[detail.status] ?? STATUS.parked;

  const [fields, setFields] = useState(detail.fields);
  const [newField, setNewField] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [agent, setAgentState] = useState(detail.agent ?? "");
  const [showImport, setShowImport] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [samplePage, setSamplePage] = useState(0);
  const SAMPLES_PER_PAGE = 8;

  async function changeAgent(a: string) {
    setAgentState(a);
    try {
      await fetch("/api/rules/set-routing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, agents: a ? [a] : [] }),
      });
    } catch { /* best-effort */ }
  }

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

  function claudePrompt() {
    return `You are building the FIELD SPEC for one document type in our extraction system: "${detail.label}".
The spec is the only per-type config — our prompt, tables, and code are constant. So the spec
must fully and unambiguously describe this type.

I'll paste or attach one or more example documents of that type. The examples may come from
DIFFERENT vendors that word the same information differently. Build ONE unified spec across ALL
of them — not one spec per document.

HEADER vs REPEATING GROUPS (most important):
- Some information appears ONCE per document (header): confirmation number, passenger, totals.
  Give these scope = document.
- Some information REPEATS within one document (a detail/line group): each flight segment, each
  invoice line item, each draw line, each installment. Put each such field under a single
  repeating-GROUP name as its scope (e.g. segment, line_item, draw_line). Define the group's
  fields ONCE — never flight_1_number / flight_2_number; that is ONE field "flight_number" with
  scope = segment, and the document having two flights is data, not two fields.
- For each repeating group add: one row with key = parent (the document field copied into every
  instance — usually the confirmation/invoice number), and, if the group has its own identifier,
  one row with key = primary. Header fields leave key blank.

MERGE vendor wording:
- A field is a logical piece of information, identified by MEANING, not by any one vendor's label.
  One row per logical field per scope.
- Same meaning under different labels across vendors → ONE row; put every distinct on-document
  label in aliases (semicolon-separated, deduped). Vendor wording differences are aliases, never
  new fields (confirmation_code = "Confirmation Number" = "Record Locator" = "Booking Ref").
- Only merge when the terms truly mean the same thing. If two could differ — even if values match
  on these samples (fare-only total vs all-in charged total; per-person vs reservation total) —
  keep them SEPARATE. When unsure, do not merge; note the pair after the file.
- Before finalizing, scan for any two rows that mean the same thing within a scope and collapse them.

Produce a CSV with EXACTLY these columns:
field,scope,type,required,key,aliases,example
- field: short snake_case name for the logical field.
- scope: document, OR a single repeating-group name (snake_case) shared by every field in that group.
- type: one of text, number, currency, date, datetime, boolean.
- required: yes ONLY if every example document has it; otherwise no.
- key: parent or primary for the group-reference rows described above; otherwise blank.
- aliases: the literal labels seen across the documents, semicolon-separated. Blank if none.
- example: one example value taken from any document.

Rules: capture identifiers, parties, dates, amounts, locations — NOT marketing/legal boilerplate.
Field names and scope names lowercase snake_case. If a value contains a comma, wrap that cell in
double quotes.

Output: write the result directly to a downloadable .csv file (named ${detail.docType}_field_spec.csv)
and give me the download link. If you kept any look-alike fields separate or were unsure about a
merge or a group boundary, note those briefly after the file. Otherwise just the file.`;
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(claudePrompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setMsg("Couldn't copy — select the prompt text manually."); }
  }

  // tiny CSV parser: handles quoted cells (with commas/newlines) + a header row
  function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let row: string[] = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        if (cell !== "" || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) =>
      Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  }

  async function importCsv(file: File) {
    setBusy("csv"); setMsg(null);
    try {
      const text = await file.text();
      const recs = parseCsv(text);
      const fieldsIn = recs.map((r) => ({
        name: r.field || r.name || "",
        scope: r.scope || "document",        // 'document' (header) or a repeating-group name
        type: r.type || "text",
        required: /^(y|yes|true|1|required)$/i.test(r.required || ""),
        key: r.key || "",                    // primary | parent | blank
        aliases: (r.aliases || "").split(";").map((a) => a.trim()).filter(Boolean),
        example: r.example || "",
      })).filter((f) => f.name);
      if (!fieldsIn.length) { setMsg("No fields found — check the CSV header row: field,scope,type,required,key,aliases,example"); setBusy(null); return; }
      const r = await fetch("/api/rules/import-fields", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, fields: fieldsIn }),
      });
      if (r.ok) {
        const j = await r.json();
        setMsg(`Imported ${j.imported} fields${j.aliases ? ` + ${j.aliases} aliases` : ""} ✓`);
        setTimeout(() => router.refresh(), 800);
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(`Import failed: ${j.error ?? r.statusText}`);
      }
    } catch (e) { setMsg(`Import failed: ${e instanceof Error ? e.message : "error"}`); }
    setBusy(null);
  }

  async function addField() {
    const name = newField.trim();
    if (!name || fields.some((f) => f.name.toLowerCase() === name.toLowerCase())) { setNewField(""); return; }
    setFields((fs) => [...fs, { name, dataType: "text", required: newRequired, aliases: [], source: "curated", lastValue: null, scope: "document", fieldKey: null }]);
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
              <h1 className="text-[20px] font-semibold tracking-tight text-brand-navy">{detail.label}</h1>
              <span className="font-mono text-[11px] text-slate-400">{detail.docType}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.icon} {st.label}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500">
              <span>{detail.category}</span><span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                Routes to
                <select value={agent} onChange={(e) => changeAgent(e.target.value)}
                  className={`rounded-md border px-1.5 py-0.5 text-[12px] ${agent ? "border-transparent bg-sky-50 font-semibold text-sky-700" : "border-amber-300 text-amber-600"}`}>
                  <option value="">— unrouted —</option>
                  {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </span>
              <span className="text-slate-300">·</span><span>{fields.length} fields</span>
              <span className="text-slate-300">·</span><span>{detail.sampleCount} samples</span>
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button onClick={copyPrompt} disabled={copied}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors ${copied ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-700"}`}>
              {copied ? "✓ Copied" : "⧉ Copy Claude prompt"}</button>
            <button onClick={() => setShowImport((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${showImport ? "border-brand-navy bg-brand-navy text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
              ⬆ Import CSV</button>
          </div>
        </div>

        {/* Import panel — opens inline at the top, no scrolling */}
        {showImport && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-[12.5px] text-slate-600">
              Run <b>Copy Claude prompt</b> against your example documents, then drop the CSV here.
            </div>
            <label className="block cursor-pointer rounded-md border border-dashed border-slate-300 bg-white p-4 text-center">
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); }} />
              <div className="text-[13px] text-slate-700">{busy === "csv" ? "Importing…" : <>Drop the <span className="font-medium">CSV</span> here, or <span className="text-blue-600">browse</span></>}</div>
              <div className="mt-1 text-[11.5px] text-slate-400">Columns: <span className="font-mono">field, scope, type, required, key, aliases, example</span> — replaces this type’s spec.</div>
            </label>
            {msg && <div className="mt-2 text-[12px] text-emerald-700">{msg}</div>}
          </div>
        )}
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
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {fields.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[13px] text-slate-400">No fields yet — add one below, or import a CSV.</td></tr>
            )}
            {fields.slice(0, 120).map((f) => (
              <tr key={`${f.scope}:${f.name}`}>
                <td className="px-4 py-2.5">
                  <span className={f.required ? "text-red-500" : "text-slate-300"}>●</span> <span className="font-medium text-slate-800">{f.name}</span>
                  {f.fieldKey && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{f.fieldKey}</span>}
                  {f.source === "learned" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">suggested</span>}
                </td>
                <td className="px-4 py-2.5">
                  {f.scope === "document"
                    ? <span className="text-[12px] text-slate-400">document</span>
                    : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">⛓ {f.scope}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{f.dataType}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.aliases.length ? f.aliases.map((a) => `"${a}"`).join(", ") : "—"}</td>
                <td className="px-4 py-2.5">
                  {f.source === "learned"
                    ? <button onClick={() => confirmField(f.name)} className="text-[12px] font-medium text-emerald-600">Confirm</button>
                    : <span className="font-mono text-[11.5px] text-slate-500">{f.lastValue ?? "—"}</span>}
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
                  <th className="px-4 py-2 text-right font-semibold">Document</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pageSamples.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="w-32 px-4 py-2.5 text-slate-500">{s.date ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{sampleLabel(s)}</td>
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
