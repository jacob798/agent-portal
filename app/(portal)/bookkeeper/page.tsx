// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getLedger } from "@/lib/data/bookkeeper";
import { getBcReimbursement, BC_HISTORY } from "@/lib/data/bc";
import BookkeeperModule from "@/components/bookkeeper/BookkeeperModule";

export default async function BookkeeperPage() {
  const [ledger, bc] = await Promise.all([getLedger(), getBcReimbursement()]);
  return <BookkeeperModule ledger={ledger} bc={bc} bcHistory={BC_HISTORY} />;
}
