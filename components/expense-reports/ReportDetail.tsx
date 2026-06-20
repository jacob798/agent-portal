"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, FileText, Archive, Download } from "lucide-react";
import { ENT, money } from "@/lib/data/entities";
import { type ExpenseReport, fmtRange, fmtDate } from "@/lib/data/expenseReportsShared";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { StatusStepper } from "./statusUi";

export default function ReportDetail({ report }: { report: ExpenseReport }) {
  const router = useRouter();
  const { message, toast } = useToast();
  const [busy, setBusy] = useState(false);

  /** POST then stream the response body down as a file download. */
  async function download(url: string, fallbackName: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Download failed");
      }
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
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed");
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
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast("Marked submitted");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const DownloadGroup = () => (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate?only=xlsx`, `${report.name}.xlsx`)}>
        <FileSpreadsheet className="h-4 w-4" /> XLSX
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate`, `${report.name}.zip`)}>
        <Archive className="h-4 w-4" /> Invoices .zip
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => download(`/api/expense-reports/generate?only=pdf`, `${report.name}.pdf`)}>
        <FileText className="h-4 w-4" /> BCX report PDF
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <button
        onClick={() => router.push("/expense-reports")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All reports
      </button>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-brand-navy">{report.name}</h1>
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand-navy ring-1 ring-inset ring-brand/25">
                {report.entity}
              </span>
            </div>
            <StatusStepper status={report.status} />
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {report.status === "draft" && (
                <Button variant="success" disabled={busy} onClick={generate}>
                  <Download className="h-4 w-4" /> Generate package
                </Button>
              )}
              {report.status === "generated" && (
                <>
                  <DownloadGroup />
                  <Button variant="primary" disabled={busy} onClick={markSubmitted}>Mark submitted</Button>
                </>
              )}
              {report.status === "submitted" && (
                <>
                  <DownloadGroup />
                  <Button variant="success" disabled={busy} onClick={() => router.push(`/expense-reports/${report.id}/reconcile`)}>
                    Reconcile
                  </Button>
                </>
              )}
              {report.status === "reimbursed" && <DownloadGroup />}
            </div>
            {report.status !== "reimbursed" && (
              <Button variant="ghost" size="sm" onClick={() => router.push(`/expense-reports/${report.id}/select`)}>
                Reopen / edit items
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <Meta label="Entity" value={ENT[report.entity] ?? report.entity} />
          <Meta label="Range" value={fmtRange(report.dateFrom, report.dateTo) || "—"} />
          <Meta label="Items" value={String(report.itemCount)} />
          <Meta label="Total" value={money(report.total)} />
          {report.payrollPaidDate && <Meta label="Payroll paid" value={fmtDate(report.payrollPaidDate)} />}
          {report.note && <Meta label="Note" value={report.note} />}
        </div>

        {report.ecreditApplied > 0 && (
          <div className="flex items-start gap-2 rounded-lg border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2">
            <span aria-hidden="true">🎫</span>
            <p className="text-[12.5px] text-emerald-900">
              <b>{money(report.ecreditApplied)} of this claim was paid with eCredits</b> applied but not previously expensed — the full fares are reimbursable, so the claim is not duplicated.
            </p>
          </div>
        )}
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
