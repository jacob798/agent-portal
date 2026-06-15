"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocTypeDetail } from "@/lib/data/rules";

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
    return `You are setting up the field spec for one document type in our document system: "${detail.label}".

I'll paste or attach one or more example documents of that type. The examples may come from
DIFFERENT vendors that use different wording for the same information.

Build ONE unified spec across ALL the examples — not one spec per document. The whole point
is to reconcile vendor differences into shared fields:
- A "field" is a logical piece of information, identified by its MEANING, not by the label
  any single vendor prints. Output exactly one row per logical field.
- When two or more documents carry the same logical field under different labels, MERGE them
  into a SINGLE row. Do NOT create separate or vendor-specific fields for it
  (e.g. confirmation_code, record_locator, and booking_ref are ONE field, not three).
- Capture every distinct on-document label you saw for that field in the aliases column,
  separated by semicolons and deduplicated. Vendor wording differences belong in aliases —
  never as new fields.
- Only merge when the terms truly mean the same thing. If two terms could carry a different
  meaning — even if their values happen to match on these particular samples (e.g. a fare-only
  total vs. an all-in charged total, or a per-person total vs. a reservation total) — keep them
  as SEPARATE fields. When unsure, do not merge; flag the pair instead.
- Before finalizing, scan your field list for any two rows that mean the same thing and
  collapse them.

Produce a CSV with EXACTLY these columns:
field,type,required,aliases,example
- field: short snake_case name for the logical field (e.g. confirmation_code, passenger_name,
  flight_number, origin, destination, depart_datetime, total_amount).
- type: one of text, number, currency, date, datetime, boolean.
- required: yes ONLY if every example document has it; otherwise no.
- aliases: the literal labels seen across the documents, semicolon-separated. Blank if none.
- example: one example value, taken from any of the documents.

Rules: capture identifiers, parties, dates, amounts, locations — NOT marketing/legal
boilerplate. Field names lowercase snake_case. If a value contains a comma, wrap that cell
in double quotes.

Output: write the result directly to a downloadable .csv file (named ${detail.docType}_field_spec.csv)
and give me the download link. If you had to keep any look-alike fields separate or were unsure
about a merge, note those briefly after the file. Otherwise just the file.`;
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(claudePrompt()); setMsg("Prompt copied — paste it into Claude with your example document(s)."); }
    catch { setMsg("Couldn't copy — select the prompt text manually."); }
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
        type: r.type || "text",
        required: /^(y|yes|true|1|required)$/i.test(r.required || ""),
        aliases: (r.aliases || "").split(";").map((a) => a.trim()).filter(Boolean),
        example: r.example || "",
      })).filter((f) => f.name);
      if (!fieldsIn.length) { setMsg("No fields found — check the CSV has a header row: field,type,required,aliases,example"); setBusy(null); return; }
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
    setFields((fs) => [...fs, { name, dataType: "text", required: newRequired, aliases: [], source: "curated", lastValue: null }]);
    setNewField(""); setNewRequired(false);
    try {
      await fetch("/api/rules/add-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: detail.docType, name, required: newRequired }),
      });
    } catch { /* best-effort */ }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
      <a href="/rules?tab=routing" className="text-[12.5px] text-blue-600">← Document types</a>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[19px] font-semibold tracking-tight text-brand-navy">{detail.label}</span>
        <span className="font-mono text-[11.5px] text-slate-400">{detail.docType}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.icon} {st.label}</span>
        <span className="text-[12.5px] text-slate-500">
          {detail.category} · routes to <span className="text-blue-600">{detail.agent ?? "— unrouted"}</span> · {fields.length} fields · {detail.sampleCount} samples
        </span>
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
            <th className="px-4 py-2 font-semibold">Type</th>
            <th className="px-4 py-2 font-semibold">Labels (aliases)</th>
            <th className="px-4 py-2 font-semibold">Last captured</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {fields.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-[13px] text-slate-400">No fields yet — add one below, or import a CSV.</td></tr>
            )}
            {fields.slice(0, 80).map((f) => (
              <tr key={f.name}>
                <td className="px-4 py-2.5">
                  <span className={f.required ? "text-red-500" : "text-slate-300"}>●</span> <span className="font-medium text-slate-800">{f.name}</span>
                  {f.source === "learned" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">suggested</span>}
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
              <td className="px-4 py-2.5" colSpan={2}>
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

      {/* Sample documents — clickable */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-[13.5px] font-semibold text-slate-900">Sample documents</span>
          <span className="text-[12px] text-slate-500">{detail.sampleCount}</span>
        </div>
        {detail.samples.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-slate-400">No documents of this type yet.</div>
        ) : (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-slate-100">
              {detail.samples.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="w-28 px-4 py-2.5 text-slate-500">{s.date ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.vendor ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-400">{s.source ?? ""}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.url
                      ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium text-blue-600">Open ↗</a>
                      : <span className="text-[12px] text-slate-300" title={s.path ?? ""}>filed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import the field spec from a CSV (generated in Claude) */}
      <div className="rounded-xl border border-slate-300/70 bg-white p-4 shadow-sm">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-slate-900">📑 Import fields from a CSV</span>
          <span className="text-[11.5px] text-slate-400">run the prompt in Claude → upload the CSV it gives you</span>
          <button onClick={copyPrompt}
            className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-medium text-white">⧉ Copy the Claude prompt</button>
        </div>
        <label className="block cursor-pointer rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); }} />
          <div className="text-[13px] text-slate-700">{busy === "csv" ? "Importing…" : <>Drop the <span className="font-medium">CSV</span> here, or <span className="text-blue-600">browse</span></>}</div>
          <div className="mt-1 text-[11.5px] text-slate-400">Columns: <span className="font-mono">field, type, required, aliases, example</span> — adds them to this type’s spec.</div>
        </label>
      </div>

    </div>
  );
}
