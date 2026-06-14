"use client";

import { useState } from "react";
import type { FailureReason, LearnedItem, RouteRow, KnowledgeVendor, LearningStats } from "@/lib/data/rules";

type Tab = "learned" | "report" | "routing" | "knowledge";

const AGENT_TONE: Record<string, string> = {
  travel: "bg-sky-50 text-sky-700", payables: "bg-violet-50 text-violet-700",
  valuation: "bg-emerald-50 text-emerald-700", bookkeeper: "bg-amber-50 text-amber-700",
};

export default function Rules({
  stats, report, learned, routing, vendors,
}: {
  stats: LearningStats; report: FailureReason[]; learned: LearnedItem[];
  routing: RouteRow[]; vendors: KnowledgeVendor[];
}) {
  const [tab, setTab] = useState<Tab>("learned");
  const maxN = Math.max(1, ...report.map((r) => r.count));

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
              {report.map((r) => (
                <div key={r.reason} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-56 shrink-0 text-[13px] text-slate-700">{r.reason}</span>
                    <div className="h-2 w-full max-w-xs rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${r.tone === "red" ? "bg-red-500" : r.tone === "amber" ? "bg-amber-500" : "bg-sky-500"}`}
                        style={{ width: `${(r.count / maxN) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-right font-semibold tabular-nums">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "learned" && (
        <Panel title="Learned" hint="captured from your corrections & postings — review/keep">
          {learned.length === 0 ? <Empty>Nothing learned yet — corrections and postings will show here.</Empty> : (
            <div className="divide-y divide-slate-100">
              {learned.map((x, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">{x.kind}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-slate-900">{x.title}</div>
                    <div className="text-[12px] text-slate-500">{x.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "routing" && (
        <Panel title="Routing" hint="which agent owns each document type — content decides, not the inbox">
          {routing.length === 0 ? <Empty>No routing configured.</Empty> : (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-semibold">Document type</th><th className="px-4 py-2 font-semibold">Routes to</th><th className="px-4 py-2 font-semibold">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {routing.map((r) => (
                  <tr key={r.docType}><td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5">{r.agents.map((a) => (
                      <span key={a} className={`mr-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${AGENT_TONE[a] ?? "bg-slate-100 text-slate-600"}`}>{a}</span>))}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${r.status === "fan-out" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>{r.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {tab === "knowledge" && (
        <Panel title="Knowledge — vendors" hint="master data the agents resolve against · Learned = from your corrections">
          {vendors.length === 0 ? <Empty>No vendors yet.</Empty> : (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-semibold">Vendor</th><th className="px-4 py-2 font-semibold">Aliases</th><th className="px-4 py-2 font-semibold">Entity</th><th className="px-4 py-2 font-semibold">Source</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.name}><td className="px-4 py-2.5 font-semibold text-slate-900">{v.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{v.aliases.join(" · ") || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{v.entity ?? "—"}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.source === "learned" ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700"}`}>{v.source === "learned" ? "✨ Learned" : "Set by you"}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
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
