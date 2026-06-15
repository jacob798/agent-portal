"use client";

import { useState } from "react";
import type { DocTypeDetail } from "@/lib/data/rules";

const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  parked:   { label: "Parked",   cls: "bg-slate-100 text-slate-500",   icon: "○" },
  in_setup: { label: "In setup", cls: "bg-amber-50 text-amber-700",    icon: "◔" },
  active:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700", icon: "●" },
  drifting: { label: "Drifting", cls: "bg-red-50 text-red-700",         icon: "▲" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-400",    icon: "▫" },
};

export default function DocTypeDetail({ detail }: { detail: DocTypeDetail }) {
  const [ctx, setCtx] = useState(detail.context ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const st = STATUS[detail.status] ?? STATUS.parked;

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

  return (
    <div className="space-y-3.5">
      <a href="/rules" className="text-[12.5px] text-blue-600">← Document types</a>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[19px] font-medium">{detail.label}</span>
        <span className="font-mono text-[11.5px] text-slate-400">{detail.docType}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.icon} {st.label}</span>
        <span className="text-[12.5px] text-slate-500">
          {detail.category} · routes to <span className="text-blue-600">{detail.agent ?? "— unrouted"}</span> · {detail.fields.length} fields · {detail.sampleCount} samples
        </span>
      </div>

      {/* AI document-type context */}
      <div className="rounded-xl border border-slate-300/70 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium">✨ Document type context</span>
          <span className="text-[11.5px] text-slate-400">from samples + fields</span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={generate} disabled={busy === "gen"}
              className="rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-700 disabled:opacity-50">
              {busy === "gen" ? "Queuing…" : "✨ Generate with AI"}
            </button>
          </div>
        </div>
        <textarea value={ctx} onChange={(e) => setCtx(e.target.value)} rows={4}
          className="w-full rounded-md border border-slate-200 p-2.5 text-[13.5px] leading-relaxed"
          placeholder="No context yet — click Generate with AI to draft it from this type's samples and fields." />
        {detail.purpose && <div className="mt-1.5 text-[12px] text-slate-500">Purpose: {detail.purpose}</div>}
        {msg && <div className="mt-2 text-[12px] text-emerald-700">{msg}</div>}
      </div>

      {/* Fields = the "look for" */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5">
          <span className="text-[13.5px] font-medium">Fields</span>
          <span className="text-[12px] text-slate-500">{detail.fields.length} · {detail.fields.filter((f) => f.required).length} required · = the “look for”</span>
        </div>
        {detail.fields.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-slate-400">No fields defined yet — teach from a sample below.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3.5 py-2 font-medium">Field</th><th className="px-3.5 py-2 font-medium">Type</th><th className="px-3.5 py-2 font-medium">Labels (aliases)</th></tr></thead>
            <tbody>
              {detail.fields.slice(0, 40).map((f) => (
                <tr key={f.name} className="border-t border-slate-100">
                  <td className="px-3.5 py-2"><span className={f.required ? "text-red-500" : "text-slate-300"}>●</span> <span className="font-medium">{f.name}</span></td>
                  <td className="px-3.5 py-2 text-slate-500">{f.dataType}</td>
                  <td className="px-3.5 py-2 text-slate-500">{f.aliases.length ? f.aliases.map((a) => `"${a}"`).join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sample documents */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5">
          <span className="text-[13.5px] font-medium">Sample documents</span>
          <span className="text-[12px] text-slate-500">{detail.sampleCount}</span>
        </div>
        {detail.samples.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-slate-400">No samples yet.</div>
        ) : (
          <table className="w-full text-[13px]">
            <tbody>
              {detail.samples.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3.5 py-2 w-28">{s.date ?? "—"}</td>
                  <td className="px-3.5 py-2">{s.vendor ?? "—"}</td>
                  <td className="px-3.5 py-2 text-slate-400">{s.source ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Teach from a sample */}
      <div className="rounded-xl border border-slate-300/70 bg-slate-50 p-4">
        <div className="mb-2.5 text-[13.5px] font-medium">⬆ Add a new document — teach from a sample</div>
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-center">
          <div className="text-[13px]">Drop a {detail.label.toLowerCase()} here, or <span className="text-blue-600">browse</span></div>
          <div className="mt-1 text-[11.5px] text-slate-400">Reads it, fills the captured values, and suggests new fields/labels to confirm — and refreshes the context. <span className="italic">(processing wired next)</span></div>
        </div>
      </div>
    </div>
  );
}
