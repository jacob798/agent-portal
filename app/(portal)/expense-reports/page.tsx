// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getExpenseReports } from "@/lib/data/expenseReports";
import ExpenseReports from "@/components/expense-reports/ExpenseReports";

export default async function ExpenseReportsPage() {
  const reports = await getExpenseReports();
  return <ExpenseReports initial={reports} />;
}
