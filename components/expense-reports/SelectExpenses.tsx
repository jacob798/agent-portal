"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { money } from "@/lib/data/entities";
import { type ExpenseReport, type ExpenseRow, fmtMD, fmtRange } from "@/lib/data/expenseReportsShared";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

type SortKey = "date" | "payee" | "traveler" | "trip" | "account" | "amount";

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function SelectExpenses({
  report,
  pool,
  onReport,
  fromISO,
  toISO,
}: {
  report: ExpenseReport;
  pool: ExpenseRow[];
  onReport: ExpenseRow[];
  fromISO: string;
  toISO: string;
}) {
  const router = useRouter();
  const { message, toast } = useToast();

  // Rows already on this report are pre-checked. The visible pool is the unexpensed window
  // PLUS the on-report rows (so you can toggle them off).
  const rows = useMemo(() => {
    const seen = new Set(pool.map((r) => r.id));
    return [...pool, ...onReport.filter((r) => !seen.has(r.id))];
  }, [pool, onReport]);

  const [checked, setChecked] = useState<Set<string>>(() => new Set(onReport.map((r) => r.id)));
  const [from, setFrom] = useState(fromISO);
  const [to, setTo] = useState(toISO);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: 1 });

  const sorted = useMemo(() => {
    const val = (r: ExpenseRow, k: SortKey): string | number => {
      switch (k) {
        case "date": return r.date ?? "";
        case "payee": return r.payee.toLowerCase();
        case "traveler": return (r.traveler ?? "").toLowerCase();
        case "trip": return r.tripName?.destination?.toLowerCase() ?? "";
        case "account": return r.account.toLowerCase();
        case "amount": return r.amount;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a, sort.key);
      const bv = val(b, sort.key);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return c * sort.dir;
    });
  }, [rows, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  }

  const selectedTotal = useMemo(
    () => rows.filter((r) => checked.has(r.id)).reduce((a, r) => a + r.amount, 0),
    [rows, checked],
  );

  async function toggleRow(row: ExpenseRow) {
    const add = !checked.has(row.id);
    // optimistic
    setChecked((prev) => {
      const next = new Set(prev);
      if (add) next.add(row.id);
      else next.delete(row.id);
      return next;
    });
    try {
      const res = await fetch("/api/expense-reports/add-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, ids: [row.id], add }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
    } catch (e) {
      // revert on failure
      setChecked((prev) => {
        const next = new Set(prev);
        if (add) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
      toast(e instanceof Error ? e.message : "Failed to update");
    }
  }

  function applyFilter() {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    router.push(`/expense-reports/${report.id}/select?${q.toString()}`);
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

  const selectedCount = rows.filter((r) => checked.has(r.id)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <button
        onClick={() => router.push(`/expense-reports/${report.id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to report
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-brand-navy">{report.name}</h1>
            <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-navy ring-1 ring-inset ring-brand/25">
              {report.entity}
            </span>
            <span className="text-sm tabular-nums text-slate-500">{fmtRange(report.dateFrom, report.dateTo)}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="ghost" size="sm" onClick={applyFilter}>Filter</Button>
          </div>
        </div>
        <Button
          variant="success"
          onClick={() => router.push(`/expense-reports/${report.id}`)}
        >
          Add {selectedCount} selected · {money(selectedTotal)}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full" style={{ minWidth: 870 }}>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-10 px-4 py-2.5" />
              <Th k="date">Date</Th>
              <Th k="payee">Payee</Th>
              <Th k="traveler">Traveler</Th>
              <Th k="trip">Trip</Th>
              <Th k="account">Account</Th>
              <Th k="amount" right>Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => {
              const on = checked.has(r.id);
              return (
                <tr key={r.id} className={`transition ${on ? "bg-emerald-50/40" : "hover:bg-slate-50"}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleRow(r)}
                      className="h-4 w-4 cursor-pointer accent-emerald-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-600">{fmtMD(r.date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{r.payee}</span>
                      {r.entityCode && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {r.entityCode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.traveler ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.tripName ? (
                      <div className="leading-tight">
                        <div className="text-sm text-slate-800">
                          {[r.tripName.destination, r.tripName.purpose].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">{fmtRange(r.tripName.start, r.tripName.end)}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: "#ba7517" }}>{r.account || "—"}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-slate-900">{money(r.amount)}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                  No unexpensed {report.entity} expenses in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Toast message={message} />
    </div>
  );
}
