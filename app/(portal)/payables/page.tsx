import { getPayablesQueue } from "@/lib/data/payables";
import Payables from "@/components/payables/Payables";

export default async function PayablesPage() {
  const rows = await getPayablesQueue();
  return <Payables initial={rows} />;
}
