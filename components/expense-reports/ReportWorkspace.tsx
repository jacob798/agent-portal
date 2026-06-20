"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, FileText, Package, Download, Pencil, Check, Bot } from "lucide-react";
import { ENT, money } from "@/lib/data/entities";
import {
  type ExpenseReport,
  type ExpenseRow,
  fmtMD,
  fmtRange,
  fmtDate,
  requestedAmount,
  ecreditNote,
} from "@/lib/data/expenseReportsShared";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { StatusStepper } from "./statusUi";

type SortKey = "date" | "payee" | "traveler" | "trip" | "account" | "invoice" | "amount";

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

/** The single report workspace: the report header (stepper, meta, memo, eCredit, lifecycle
 *  actions) ON TOP of the item ledger. Replaces the old detail + select pages. The ledger is
 *  editable in Draft (or after "Edit items" unlocks it post-generation); otherwise read-only. */
export default function ReportWorkspace({
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
  const [busy, setBusy] = useState(false);

  // Items stay editable through Draft AND Generated; they lock at Submitted (committed — can never
  // move onto a future report). Editing is gated behind the "Edit items" toggle (Jacob, 2026-06-20).
  const canEdit = report.status === "draft" || report.status === "generated";
  const [editing, setEditing] = useState(false);
  const editable = canEdit && editing;

  const [checked, setChecked] = useState<Set<string>>(() => new Set(onReport.map((r) => r.id)));
  const [from, setFrom] = useState(fromISO);
  const [to, setTo] = useState(toISO);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: 1 });

  // The report name/label — editable on any status (renaming never touches posted expenses).
  const [name, setName] = useState(report.name ?? "");
  const [editingName, setEditingName] = useState(false);

  // The memo that flows onto the BCX submission.
  const [note, setNote] = useState(report.note ?? "");
  const [editingNote, setEditingNote] = useState(false);

  // Every row we know about (pool + on-report), so totals over the checked set are always correct.
  const allRows = useMemo(() => {
    const seen = new Set(pool.map((r) => r.id));
    return [...pool, ...onReport.filter((r) => !seen.has(r.id))];
  }, [pool, onReport]);

  // Rows shown: when editable, the whole pool to pick from; when locked, only what's on the report.
  const rows = editable ? allRows : onReport;

  const sorted = useMemo(() => {
    const val = (r: ExpenseRow, k: SortKey): string | number => {
      switch (k) {
        case "date": return r.date ?? "";
        case "payee": return r.payee.toLowerCase();
        case "traveler": return (r.traveler ?? "").toLowerCase();
        case "trip": return r.tripName?.destination?.toLowerCase() ?? "";
        case "account": return r.account.toLowerCase();
        case "invoice": return (r.invoiceNumber ?? "").toLowerCase();
        case "amount": return requestedAmount(r);
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

  // Live totals from the checked set (so the header reflects edits before a server refresh).
  const onRows = useMemo(() => allRows.filter((r) => checked.has(r.id)), [allRows, checked]);
  const liveTotal = useMemo(() => onRows.reduce((a, r) => a + requestedAmount(r), 0), [onRows]);
  const liveEcredit = useMemo(() => onRows.reduce((a, r) => a + (r.creditAmount ?? 0), 0), [onRows]);
  const liveCount = onRows.length;

  async function toggleRow(row: ExpenseRow) {
    if (!editable) return;
    const add = !checked.has(row.id);
    setChecked((prev) => {
      const next = new Set(prev);
      if (add) next.add(row.id); else next.delete(row.id);
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
      setChecked((prev) => {
        const next = new Set(prev);
        if (add) next.delete(row.id); else next.add(row.id);
        return next;
      });
      toast(e instanceof Error ? e.message : "Failed to update");
    }
  }

  function applyFilter() {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    router.push(`/expense-reports/${report.id}?${q.toString()}`);
  }

  async function saveName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === report.name) { setName(report.name ?? ""); return; }
    try {
      const res = await fetch("/api/expense-reports/set-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, name: trimmed }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to rename");
      setName(report.name ?? "");
    }
  }

  async function saveNote() {
    setEditingNote(false);
    if ((note.trim() || null) === (report.note ?? null)) return;
    try {
      const res = await fetch("/api/expense-reports/set-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save memo");
    }
  }

  async function download(url: string, fallbackName: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m?.[1] || fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      const saved = res.headers.get("X-Dropbox-Saved");
      if (saved) toast(`Saved to Dropbox: ${saved}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    setBusy(true);
    try {
      const res = await fetch(`/api/expense-reports/generate?only=prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      await navigator.clipboard.writeText(await res.text());
      toast("Claude Work prompt copied — paste it into Claude Work");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to build prompt");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    await download(`/api/expense-reports/generate`, `${report.name}.zip`);
    toast("Package generated");
    router.refresh();
  }

  async function markSubmitted() {
    setBusy(true);
    try {
      const res = await fetch("/api/expense-reports/mark-submitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast("Marked submitted");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const DownloadGroup = () => (
    <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate?only=xlsx`, `${report.name}.xlsx`)}>
        <FileSpreadsheet className="h-4 w-4" /> XLSX
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate`, `${report.name}.zip`)}>
        <Package className="h-4 w-4" /> Download package
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate?only=pdf`, `${report.name}.pdf`)}>
        <FileText className="h-4 w-4" /> BCX report PDF
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={copyPrompt}>
        <Bot className="h-4 w-4" /> Claude Work prompt
      </Button>
    </>
  );

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
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <button
        onClick={() => router.push("/expense-reports")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All reports
      </button>

      {/* ── Report header ─────────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              {editingName ? (
                <input
                  autoFocus
                  className="w-[28rem] max-w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xl font-semibold tracking-tight text-brand-navy outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  className="group flex items-center gap-1.5 text-left"
                  title="Rename report"
                >
                  <h1 className="text-xl font-semibold tracking-tight text-brand-navy">{name || report.name}</h1>
                  <Pencil className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500" />
                </button>
              )}
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-navy ring-1 ring-inset ring-brand/25">
                {report.entity}
              </span>
            </div>
            <StatusStepper status={report.status} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canEdit && (
              editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <Check className="h-4 w-4" /> Done editing
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit items
                </Button>
              )
            )}
            {report.status === "draft" && (
              <Button variant="success" size="sm" disabled={busy} onClick={generate}>
                <Download className="h-4 w-4" /> Generate package
              </Button>
            )}
            {report.status === "generated" && (
              <>
                <DownloadGroup />
                <Button variant="primary" size="sm" disabled={busy} onClick={markSubmitted}>Mark submitted</Button>
              </>
            )}
            {report.status === "submitted" && (
              <>
                <DownloadGroup />
                <Button variant="success" size="sm" disabled={busy} onClick={() => router.push(`/expense-reports/${report.id}/reconcile`)}>
                  Reconcile
                </Button>
              </>
            )}
            {report.status === "reimbursed" && (
              <>
                <DownloadGroup />
                <Button variant="ghost" size="sm" onClick={() => router.push(`/expense-reports/${report.id}/reconcile`)}>
                  View reconciliation
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <Meta label="Entity" value={ENT[report.entity] ?? report.entity} />
          <Meta label="Range" value={fmtRange(report.dateFrom, report.dateTo) || "—"} />
          <Meta label="Items" value={String(liveCount)} />
          <Meta label="Total" value={money(liveTotal)} />
          {report.payrollPaidDate && <Meta label="Payroll paid" value={fmtDate(report.payrollPaidDate)} />}
        </div>

        {/* Report-level memo — editable inline, flows onto the BCX submission. */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Memo</div>
          {editingNote ? (
            <textarea
              autoFocus
              rows={2}
              className={`${inputCls} mt-1 w-full resize-none`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Add a memo for this report…"
            />
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="mt-0.5 flex w-full items-center gap-2 text-left text-sm text-slate-800 transition hover:text-slate-900"
            >
              <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {note.trim() ? note : <span className="text-slate-400">Add a memo for this report…</span>}
            </button>
          )}
        </div>

        {liveEcredit > 0 && (
          <div className="flex items-start gap-2 rounded-lg border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2">
            <span aria-hidden="true">🎫</span>
            <p className="text-[12.5px] text-emerald-900">
              <b>{money(liveEcredit)} of this claim was paid with eCredits</b> — the original tickets were not previously expensed, so the full fares are reimbursable.
            </p>
          </div>
        )}
      </div>

      {/* ── Item ledger ──────────────────────────────────────────── */}
      {editable && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="ghost" onClick={applyFilter}>Filter</Button>
          <span className="ml-auto text-sm tabular-nums text-slate-500">{liveCount} selected · {money(liveTotal)}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full" style={{ minWidth: 980 }}>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {editable && <th className="w-10 px-4 py-2.5" />}
              <Th k="date">Date</Th>
              <Th k="payee">Payee &amp; memo</Th>
              <Th k="traveler">Traveler</Th>
              <Th k="trip">Trip</Th>
              <Th k="account">Account</Th>
              <Th k="invoice">Invoice #</Th>
              <Th k="amount" right>Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => {
              const on = checked.has(r.id);
              const ec = ecreditNote(r);
              return (
                <Fragment key={r.id}>
                  <tr className={`transition ${on ? "bg-emerald-50/40" : "hover:bg-slate-50"}`}>
                    {editable && (
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleRow(r)}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-[12.5px] tabular-nums text-slate-600">{fmtMD(r.date)}</td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-medium text-slate-900">{r.payee}</span>
                        {r.entityCode && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{r.entityCode}</span>
                        )}
                        {r.docUrl ? (
                          <a href={r.docUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-emerald-700 hover:underline">view doc ↗</a>
                        ) : (
                          <span className="text-[11px] text-slate-300">no doc</span>
                        )}
                      </div>
                      {r.memo && <div className="mt-0.5 text-[11px] text-slate-400">{r.memo}</div>}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] text-slate-600">{r.traveler ?? "—"}</td>
                    <td className="px-4 py-2.5 align-top">
                      {r.tripName ? (
                        <div className="leading-tight">
                          <div className="text-[12.5px] text-slate-800">{[r.tripName.destination, r.tripName.purpose].filter(Boolean).join(" · ")}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">{fmtRange(r.tripName.start, r.tripName.end)}</div>
                        </div>
                      ) : (
                        <span className="text-[12.5px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top text-[12.5px] font-medium" style={{ color: "#ba7517" }}>{r.account || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-[12.5px] tabular-nums text-slate-600">{r.invoiceNumber || "—"}</td>
                    <td className="px-4 py-2.5 text-right align-top text-[12.5px] font-medium tabular-nums text-slate-900">{money(requestedAmount(r))}</td>
                  </tr>
                  {ec && (
                    <tr className={on ? "bg-emerald-50/40" : ""}>
                      {editable && <td></td>}
                      <td colSpan={7} className="px-4 pb-3 pt-0">
                        <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                          <span aria-hidden="true">🎫</span> eCredit {money(ec.amount)} applied{ec.number ? ` · #${ec.number}` : ""} — original ticket not previously expensed
                        </span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={editable ? 8 : 7} className="px-4 py-12 text-center text-sm text-slate-400">
                  {editable ? `No unexpensed ${report.entity} expenses in this window.` : "No items on this report yet."}
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}
