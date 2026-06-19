"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_ENTITIES, money } from "@/lib/data/entities";
import { type ExpenseReport, fmtRange } from "@/lib/data/expenseReportsShared";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { Toast, useToast } from "@/components/ui/Toast";
import { StatusBadge } from "./statusUi";

type SortKey = "name" | "entity" | "range" | "items" | "total" | "status";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function ExpenseReports({ initial }: { initial: ExpenseReport[] }) {
  const router = useRouter();
  const { message, toast } = useToast();
  const [reports] = useState<ExpenseReport[]>(initial);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "range", dir: -1 });
  const [showNew, setShowNew] = useState(false);

  // new-report form
  const [name, setName] = useState("");
  const [entity, setEntity] = useState(ACTIVE_ENTITIES[0]?.code ?? "BC");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const val = (r: ExpenseReport, k: SortKey): string | number => {
      switch (k) {
        case "name": return r.name.toLowerCase();
        case "entity": return r.entity;
        case "range": return r.dateFrom ?? "";
        case "items": return r.itemCount;
        case "total": return r.total;
        case "status": return r.status;
      }
    };
    return [...reports].sort((a, b) => {
      const av = val(a, sort.key);
      const bv = val(b, sort.key);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return c * sort.dir;
    });
  }, [reports, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  }

  async function createReport() {
    if (!name.trim()) {
      toast("Give the report a name");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/expense-reports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), entity, dateFrom, dateTo, note: note.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      router.push(`/expense-reports/${json.id}/select`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create");
      setBusy(false);
    }
  }

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${right ? "text-right" : "text-left"}`}
    >
      {children}
      {sort.key === k && <span className="ml-1 text-slate-400">{sort.dir === 1 ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense reports"
        subtitle="Bundle unexpensed payables into a report, generate the package, then reconcile the reimbursement."
        action={
          <Button variant="secondary" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => setShowNew(true)}>
            New report
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full" style={{ minWidth: 840 }}>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th k="name">Report</Th>
              <Th k="entity">Entity</Th>
              <Th k="range">Range</Th>
              <Th k="items" right>Items</Th>
              <Th k="total" right>Total</Th>
              <Th k="status">Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => router.push(`/expense-reports/${r.id}`)}
                className="cursor-pointer transition hover:bg-slate-50"
              >
                <td className="px-4 py-3 text-sm font-medium text-brand-navy">{r.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-navy ring-1 ring-inset ring-brand/25">
                    {r.entity}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-600">
                  {fmtRange(r.dateFrom, r.dateTo) || "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">{r.itemCount}</td>
                <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-slate-900">{money(r.total)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  No reports yet — create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="New expense report"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNew(false)} disabled={busy}>Cancel</Button>
            <Button variant="success" onClick={createReport} disabled={busy}>
              {busy ? "Creating…" : "Create & choose expenses"}
            </Button>
          </>
        }
      >
        <div className="space-y-4" style={{ boxSizing: "border-box" }}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Report name</label>
            <input
              className={inputCls}
              style={{ boxSizing: "border-box", width: "100%" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Builders Capital — June travel"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Entity</label>
            <select
              className={inputCls}
              style={{ boxSizing: "border-box", width: "100%" }}
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            >
              {ACTIVE_ENTITIES.map((e) => (
                <option key={e.code} value={e.code}>{e.code} — {e.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
              <input type="date" className={inputCls} style={{ boxSizing: "border-box", width: "100%" }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
              <input type="date" className={inputCls} style={{ boxSizing: "border-box", width: "100%" }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Note <span className="font-normal normal-case text-slate-400">(optional)</span></label>
            <input className={inputCls} style={{ boxSizing: "border-box", width: "100%" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember about this report" />
          </div>
        </div>
      </Modal>

      <Toast message={message} />
    </div>
  );
}
