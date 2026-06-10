"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { LedgerRow, TxnType } from "@/lib/data/bookkeeper";
import { money } from "@/lib/data/entities";
import { Badge, type Tone } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import FilterTabs from "@/components/ui/FilterTabs";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const TYPE_TONE: Record<TxnType, Tone> = {
  Purchase: "indigo",
  Bill: "indigo",
  Deposit: "green",
  Check: "amber",
};

export default function Bookkeeper({ initial }: { initial: LedgerRow[] }) {
  const [rows, setRows] = useState<LedgerRow[]>(initial);
  const [filter, setFilter] = useState("all");
  const { message, toast } = useToast();

  const patch = (id: string, p: Partial<LedgerRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const counts = useMemo(() => {
    const ready = rows.filter((r) => r.status === "ready").length;
    const posted = rows.filter((r) => r.status === "posted").length;
    const err = rows.filter((r) => r.status === "err").length;
    const gap = rows.filter((r) => r.gap).length;
    return { ready, posted, err, gap };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "gap") return r.gap;
    return r.status === filter;
  });

  function retry(id: string) {
    const r = rows.find((x) => x.id === id);
    patch(id, { status: "posted", ref: "QB Txn #1081" });
    if (r) toast(`↻ Retried — ${r.vendor} posted to ${r.file}`);
  }
  function retryAll() {
    setRows((rs) => rs.map((r) => (r.status === "err" ? { ...r, status: "posted", ref: "QB Txn #1081" } : r)));
    toast("↻ Retried all failed — posted to QuickBooks");
  }
  function attach(id: string) {
    const r = rows.find((x) => x.id === id);
    patch(id, { gap: false });
    if (r) toast(`📎 Receipt matched to ${r.vendor} — documentation gap cleared`);
  }
  function hold(id: string) {
    const r = rows.find((x) => x.id === id);
    patch(id, { status: "held", ref: "held" });
    if (r) toast(`⏸ ${r.vendor} held out of this batch`);
  }
  function release(id: string) {
    const r = rows.find((x) => x.id === id);
    patch(id, { status: "ready", ref: "ready" });
    if (r) toast(`${r.vendor} returned to the batch`);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="Bookkeeper"
        subtitle="QuickBooks posting authority — posts via the QBO API over OAuth."
        action={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> QuickBooks connected
            </span>
            <Button onClick={() => toast("Refreshing posting status from QuickBooks…")}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[13px] leading-relaxed text-emerald-900">
        ✓ <b>This is the posting record — not a second approval.</b> Items you approve in{" "}
        <b>Payables</b> (and Travel) post to QuickBooks automatically and land here. You only dig
        into <b>errors</b> and <b>doc-gaps</b>.
      </div>

      {counts.ready > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3.5">
          <div>
            <div className="font-semibold text-brand-navy">⏳ {counts.ready} item{counts.ready === 1 ? "" : "s"} posting to QuickBooks this cycle</div>
            <div className="mt-0.5 text-[12.5px] text-slate-600">
              Approved in Payables — the agent is writing them to QuickBooks now. Need to pull one
              back? Use <b>hold</b> on the row.
            </div>
          </div>
        </div>
      )}

      {counts.err > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3.5">
          <div>
            <div className="font-semibold text-red-700">⚠️ {counts.err} transaction failed to post to QuickBooks</div>
            <div className="mt-0.5 text-[12.5px] text-red-900/80">{rows.find((r) => r.status === "err")?.err}</div>
          </div>
          <Button variant="danger" onClick={retryAll}>Retry failed</Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Stat label="Posting now" value={counts.ready} tone="brand" />
        <Stat label="Posted today ✓" value={counts.posted} tone="green" />
        <Stat label="Errors" value={counts.err} tone="red" />
        <Stat label="Doc-gaps" value={counts.gap} tone="amber" />
      </div>

      <div className="mt-5">
        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: "all", label: "All", count: rows.length },
            { key: "ready", label: "Ready", count: counts.ready },
            { key: "posted", label: "Posted", count: counts.posted },
            { key: "err", label: "Errors", count: counts.err },
            { key: "gap", label: "Doc-gaps", count: counts.gap },
          ]}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[16px_2.4fr_1.1fr_1.3fr_1fr_1.3fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <div />
          <div>Vendor / Memo</div>
          <div>Type</div>
          <div>QuickBooks file</div>
          <div>Amount</div>
          <div className="text-right">Status</div>
        </div>
        {visible.map((r) => {
          const dot = r.status === "err" ? "bg-red-500" : r.status === "ready" || r.status === "held" ? "bg-brand-sky" : "bg-emerald-500";
          return (
            <div key={r.id} className="border-b border-slate-100 last:border-0">
              <div className="grid grid-cols-[16px_2.4fr_1.1fr_1.3fr_1fr_1.3fr] items-center gap-3 px-5 py-3.5 hover:bg-brand/[0.03]">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <span className="truncate">{r.vendor}</span>
                    {r.gap && r.status !== "err" && <Badge tone="amber">no receipt</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-slate-500">{r.memo}</div>
                </div>
                <div><Badge tone={TYPE_TONE[r.type]}>{r.type}</Badge></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-slate-900">
                    {r.file}
                    {r.legs && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">intercompany</span>}
                  </div>
                  <div className="truncate text-[11.5px] text-slate-500">{r.sub}</div>
                </div>
                <div className="font-semibold tabular-nums">{money(r.amount)}</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {r.status === "err" ? (
                    <>
                      <span className="text-[12.5px] font-semibold text-red-600">⚠ Failed</span>
                      <Mini onClick={() => retry(r.id)} tone="red">Retry</Mini>
                    </>
                  ) : r.status === "ready" ? (
                    <>
                      <span className="text-[12.5px] font-semibold text-brand">⏳ Posting…</span>
                      <button onClick={() => hold(r.id)} className="text-xs font-semibold text-brand">hold</button>
                    </>
                  ) : r.status === "held" ? (
                    <>
                      <span className="text-[12.5px] font-semibold text-slate-500">⏸ Held</span>
                      <button onClick={() => release(r.id)} className="text-xs font-semibold text-brand">release</button>
                    </>
                  ) : (
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[12.5px] font-semibold text-emerald-600">✓ Posted</span>
                        {r.gap ? (
                          <Mini onClick={() => attach(r.id)} tone="amber">📎 Attach receipt</Mini>
                        ) : (
                          <span className="cursor-pointer text-xs font-medium text-brand">Open in QBO ↗</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{r.ref}</div>
                    </div>
                  )}
                </div>
              </div>
              {r.legs && (
                <div className="mx-5 mb-3 rounded-lg border border-violet-200 border-l-[3px] border-l-violet-500 bg-violet-50/40 px-3.5 py-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                    ⇄ Two-QB intercompany — both legs {r.status === "ready" ? "staged" : "posted"}
                  </div>
                  {r.legs.map((l, k) => (
                    <div key={k} className="mt-1.5 flex items-center gap-2.5 text-[12.5px] text-slate-600">
                      <span className="font-extrabold text-emerald-600">✓</span>
                      <span className="min-w-[210px] font-semibold text-brand-navy">{l.file}</span>
                      <span className="text-slate-500">{l.act}</span>
                      <span className="ml-auto font-semibold tabular-nums">{money(l.amount)}</span>
                    </div>
                  ))}
                  {r.balnote && <div className="mt-1.5 border-t border-dashed border-violet-200 pt-1.5 text-[12px] text-slate-500">{r.balnote}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Bookkeeper takes classified items from Payables &amp; Travel and posts them to QuickBooks via
        the QBO API. Intercompany expenses post two legs — a PER-QB Purchase + the entity-QB Bill.
      </p>

      <Toast message={message} />
    </div>
  );
}

function Mini({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: "red" | "amber" }) {
  const t =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-brand/5";
  return (
    <button onClick={onClick} className={`inline-flex h-8 items-center rounded-lg border px-3 text-[12.5px] font-semibold ${t}`}>
      {children}
    </button>
  );
}
