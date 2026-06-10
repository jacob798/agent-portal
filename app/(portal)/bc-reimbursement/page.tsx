import { getBcReimbursement, BC_HISTORY } from "@/lib/data/bc";
import BcReimbursement from "@/components/bc/BcReimbursement";

export default async function BcReimbursementPage() {
  const rows = await getBcReimbursement();
  return <BcReimbursement initial={rows} history={BC_HISTORY} />;
}
