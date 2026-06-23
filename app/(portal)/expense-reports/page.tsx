// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getExpenseReports } from "@/lib/data/expenseReports";
import ExpenseReports from "@/components/expense-reports/ExpenseReports";
import { requireModule } from "@/lib/auth/guard";

export default async function ExpenseReportsPage() {
  await requireModule("expense-reports");
  const reports = await getExpenseReports();
  return <ExpenseReports initial={reports} />;
}
