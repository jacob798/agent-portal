"use client";

import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import type { BcExpense, BcHistory } from "@/lib/data/bc";
import { money } from "@/lib/data/entities";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const BCX = { navy: "#10102e", green: "#177245" };

export default function BcReimbursement({
  initial,
  history,
}: {
  initial: BcExpense[];
  history: BcHistory[];
}) {
  const [rows, setRows] = useState<BcExpense[]>(initial);
  const { message, toast } = useToast();

  const sums = useMemo(() => {
    const inc = rows.filter((r) => r.included);
    return {
      total: inc.reduce((s, r) => s + r.amount, 0),
      travel: inc.filter((r) => r.grp === "travel").reduce((s, r) => s + r.amount, 0),
      non: inc.filter((r) => r.grp === "non").reduce((s, r) => s + r.amount, 0),
      gap: inc.filter((r) => !r.receipt).length,
    };
  }, [rows]);

  const toggle = (id: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, included: !r.included } : r)));
  const attach = (id: string) => {
    const r = rows.find((x) => x.id === id);
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, receipt: true } : x)));
    if (r) toast(`📎 Receipt attached to ${r.vendor}`);
  };
  function generate() {
    const inc = rows.filter((r) => r.included);
    const gap = inc.filter((r) => !r.receipt).length;
    if (gap) return toast(`⚠ ${gap} included item has no receipt — attach it or uncheck it first`);
    toast(`📦 Generated BCX Paylocity package — XLSX + ${inc.length} receipts (${money(sums.total)})`);
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader
        title="BC Reimbursement — June 2026"
        subtitle="Builders Capital · employer reimbursement (Paylocity)."
        action={
          <Button variant="primary" style={{ background: BCX.green }} onClick={generate}>
            <Package className="h-4 w-4" /> Generate Paylocity package
          </Button>
        }
      />

      <div
        className="mt-5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed"
        style={{ background: "#e9f4ee", borderColor: "#c4e3d1", borderLeft: `4px solid ${BCX.green}`, color: "#16432c" }}
      >
        ✓ <b>Builders Capital expenses never hit P&amp;L.</b> They post to your <b>Personal</b>{" "}
        QuickBooks as <b>Loan – Builders Capital</b> (balance sheet) and clear when Paylocity
        reimburses you. This workspace bundles <b>both travel and non-travel</b> BC expenses into one
        Paylocity package — a <b>BCX-branded XLSX + the receipt PDFs</b>.
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Stat label="This period" value={money(sums.total)} tone="navy" />
        <Stat label="Travel" value={money(sums.travel)} />
        <Stat label="Non-travel" value={money(sums.non)} />
        <Stat label="Missing receipt" value={sums.gap} tone="amber" />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Current period — June 2026</h2>
          <p className="text-[12.5px] text-slate-500">Select what to include, then generate the package. Open until submitted.</p>
        </div>

        <GroupHeader label="🧳 Travel (trip-attributed)" />
        {rows.filter((r) => r.grp === "travel").map((r) => <Row key={r.id} r={r} toggle={toggle} attach={attach} />)}
        <GroupHeader label="🧾 Non-travel (payables)" />
        {rows.filter((r) => r.grp === "non").map((r) => <Row key={r.id} r={r} toggle={toggle} attach={attach} />)}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <span className="text-[12.5px] text-slate-500">Included in this Paylocity submission</span>
          <span className="text-xl font-semibold" style={{ color: BCX.navy }}>{money(sums.total)}</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Reimbursement history</h2>
          <p className="text-[12.5px] text-slate-500">Submitted periods and how they cleared the balance sheet.</p>
        </div>
        {history.map((h) => (
          <div key={h.period} className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 last:border-0">
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                {h.period}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">● Reimbursed</span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-slate-500">{h.detail}</div>
            </div>
            <span className="font-semibold tabular-nums">{money(h.amount)}</span>
          </div>
        ))}
      </div>

      <Toast message={message} />
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="bg-slate-50/70 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
      {label}
    </div>
  );
}

function Row({
  r,
  toggle,
  attach,
}: {
  r: BcExpense;
  toggle: (id: string) => void;
  attach: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[30px_26px_2.3fr_1.4fr_1.2fr_1fr] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-brand/[0.02]">
      <button
        onClick={() => toggle(r.id)}
        className={`flex h-5 w-5 items-center justify-center rounded-md border-2 text-xs font-bold ${
          r.included ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"
        }`}
      >
        {r.included ? "✓" : ""}
      </button>
      <span className="text-center text-base">{r.ic}</span>
      <div>
        <div className="font-semibold text-slate-900">{r.vendor}</div>
        <div className="text-[12.5px] text-slate-500">{r.sub}</div>
      </div>
      <div>
        <div className="text-[12.5px] font-semibold text-brand-navy">{r.gl}</div>
        <div className="text-[11.5px] text-slate-500">{r.glsub}</div>
      </div>
      <div className="text-[12px] font-semibold">
        {r.receipt ? (
          <span className="text-emerald-600">✓ receipt</span>
        ) : (
          <span className="text-amber-600">
            ⚠ no receipt{" "}
            <button onClick={() => attach(r.id)} className="text-brand underline">attach</button>
          </span>
        )}
      </div>
      <div className="text-right font-semibold tabular-nums">{money(r.amount)}</div>
    </div>
  );
}
