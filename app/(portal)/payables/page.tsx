import { getPayablesQueue } from "@/lib/data/payables";
import { getCodingConfig } from "@/lib/data/config";
import Payables from "@/components/payables/Payables";

export default async function PayablesPage() {
  const [rows, config] = await Promise.all([getPayablesQueue(), getCodingConfig()]);
  return <Payables initial={rows} accounts={config.accounts} gls={config.gls} />;
}
