export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getExpenseReport } from "@/lib/data/expenseReports";
import ReportDetail from "@/components/expense-reports/ReportDetail";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getExpenseReport(id);
  if (!report) notFound();
  return <ReportDetail report={report} />;
}
