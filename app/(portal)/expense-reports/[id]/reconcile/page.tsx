export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getExpenseReport, getReportExpenses } from "@/lib/data/expenseReports";
import Reconcile from "@/components/expense-reports/Reconcile";

export default async function ReconcilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getExpenseReport(id);
  if (!report) notFound();
  const expenses = await getReportExpenses(id);
  return <Reconcile report={report} expenses={expenses} />;
}
