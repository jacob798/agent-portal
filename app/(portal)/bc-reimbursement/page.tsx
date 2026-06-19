// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

// BC reimbursement is now a sub-view of Bookkeeper (it's a bookkeeping function:
// the Loan – Builders Capital balance-sheet account cleared by the Paylocity deposit).
export default function BcReimbursementRedirect() {
  redirect("/bookkeeper");
}
