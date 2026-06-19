"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ACTIVE_ENTITIES, money } from "@/lib/data/entities";
import { type ExpenseReport, type ExpenseRow, fmtMD, requestedAmount, tripLabel } from "@/lib/data/expenseReportsShared";
import Button from "@/components/ui/Button";
import { StatusBadge } from "./statusUi";
import { Toast, useToast } from "@/components/ui/Toast";

const DEFAULT_VARIANCE_ENTITY = "WJW";

interface LineState {
  reimbursed: number; // dollars
  varianceEntity: string;
}

const dateInput =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function Reconcile({ report, expenses }: { report: ExpenseReport; expenses: ExpenseRow[] }) {
  const router = useRouter();
  const { message, toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [payrollPaid, setPayrollPaid] = useState(report.payrollPaidDate ?? "");
  const [openEntityPick, setOpenEntityPick] = useState<string | null>(null);

  const [lines, setLines] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const e of expenses) {
      const req = requestedAmount(e);
      init[e.id] = {
        reimbursed: e.reconcile.reimbursed ?? req, // default: assume fully reimbursed
        varianceEntity: e.reconcile.varianceEntity || DEFAULT_VARIANCE_ENTITY,
      };
    }
    return init;
  });

  const totals = useMemo(() => {
    let requested = 0;
    let reimbursed = 0;
    for (const e of expenses) {
      const req = requestedAmount(e);
      requested += req;
      reimbursed += lines[e.id]?.reimbursed ?? 0;
    }
    return { requested, reimbursed, variance: requested - reimbursed };
  }, [expenses, lines]);

  // Footer note: $X (reimbursed) clears the BC loan; $Y (variance) → entity as Business Expenses.
  const footerEntity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) {
      const v = requestedAmount(e) - (lines[e.id]?.reimbursed ?? 0);
      if (v > 0.005) {
        const ent = lines[e.id]?.varianceEntity || DEFAULT_VARIANCE_ENTITY;
        counts.set(ent, (counts.get(ent) ?? 0) + 1);
      }
    }
    let best = DEFAULT_VARIANCE_ENTITY;
    let bestN = -1;
    for (const [ent, n] of counts) if (n > bestN) { best = ent; bestN = n; }
    return best;
  }, [expenses, lines]);

  function setReimbursed(id: string, raw: string) {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], reimbursed: Number.isFinite(n) ? n : 0 } }));
  }
  function setVarianceEntity(id: string, ent: string) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], varianceEntity: ent } }));
    setOpenEntityPick(null);
  }

  function buildLines() {
    return expenses.map((e) => ({
      id: e.id,
      reimbursed: lines[e.id]?.reimbursed ?? 0,
      varianceEntity: lines[e.id]?.varianceEntity || DEFAULT_VARIANCE_ENTITY,
    }));
  }

  async function persist(endpoint: string, successMsg: string, navigate: boolean) {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, payrollPaidDate: payrollPaid || null, lines: buildLines() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast(successMsg);
      if (navigate) router.push(`/expense-reports/${report.id}`);
      else router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push(`/expense-reports/${report.id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to report
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-brand-navy">{report.name}</h1>
          <StatusBadge status={report.status} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payroll paid</label>
          <input type="date" className={dateInput} value={payrollPaid} onChange={(e) => setPayrollPaid(e.target.value)} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 104 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 168 }} />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expense</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requested</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reimbursed</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((e) => {
              const req = requestedAmount(e);
              const ls = lines[e.id] ?? { reimbursed: req, varianceEntity: DEFAULT_VARIANCE_ENTITY };
              const variance = req - ls.reimbursed;
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-600">{fmtMD(e.date)}</td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-semibold text-slate-900">{e.payee}</div>
                    <div className="text-xs text-slate-500">
                      {[e.traveler, e.account].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {e.tripName && (
                      <div className="text-xs font-medium" style={{ color: "#177245" }}>{tripLabel(e.tripName)}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-700">{money(req)}</td>
                  <td className="px-3 py-3 text-right">
                    <input
                      inputMode="decimal"
                      value={ls.reimbursed === 0 ? "" : String(ls.reimbursed)}
                      onChange={(ev) => setReimbursed(e.id, ev.target.value)}
                      placeholder="0.00"
                      className="ml-auto block w-[84px] rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm tabular-nums font-medium" style={{ color: "#177245" }}>
                        {money(variance)}
                      </span>
                      <div className="relative">
                        <button
                          onClick={() => setOpenEntityPick((p) => (p === e.id ? null : e.id))}
                          className="inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                        >
                          → {ls.varianceEntity} ▾
                        </button>
                        {openEntityPick === e.id && (
                          <div className="absolute right-0 z-20 mt-1 max-h-56 w-32 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            {ACTIVE_ENTITIES.map((opt) => (
                              <button
                                key={opt.code}
                                onClick={() => setVarianceEntity(e.id, opt.code)}
                                className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 ${opt.code === ls.varianceEntity ? "font-semibold text-emerald-700" : "text-slate-700"}`}
                              >
                                {opt.code}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-sm text-slate-400">No expenses on this report.</td>
              </tr>
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="px-3 py-3 text-sm font-semibold text-slate-700" colSpan={2}>Totals</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold text-slate-900">{money(totals.requested)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold text-slate-900">{money(totals.reimbursed)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: "#177245" }}>{money(totals.variance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{money(totals.reimbursed)}</span> clears the BC loan ·{" "}
          <span className="font-semibold" style={{ color: "#177245" }}>{money(totals.variance)}</span> → {footerEntity} as Business Expenses
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => persist("/api/expense-reports/save-reconcile", "Saved", false)}>
            Save
          </Button>
          <Button variant="success" disabled={busy} onClick={() => persist("/api/expense-reports/record-reimbursement", "Reimbursement recorded", true)}>
            Record reimbursement
          </Button>
        </div>
      </div>

      <Toast message={message} />
    </div>
  );
}
