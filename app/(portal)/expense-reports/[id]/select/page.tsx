export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getExpenseReport, getUnexpensedExpenses, getReportExpenses } from "@/lib/data/expenseReports";
import SelectExpenses from "@/components/expense-reports/SelectExpenses";

export default async function SelectExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const report = await getExpenseReport(id);
  if (!report) notFound();

  const fromISO = from || report.dateFrom || "";
  const toISO = to || report.dateTo || "";

  // Pool = unexpensed for this entity/window + the rows already on this report (so toggling off works).
  const [pool, onReport] = await Promise.all([
    getUnexpensedExpenses(report.entity, fromISO, toISO),
    getReportExpenses(id),
  ]);

  return (
    <SelectExpenses
      report={report}
      pool={pool}
      onReport={onReport}
      fromISO={fromISO}
      toISO={toISO}
    />
  );
}
