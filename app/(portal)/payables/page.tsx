import { getPayablesQueue } from "@/lib/data/payables";
import { getCodingConfig } from "@/lib/data/config";
import { getIngestionLog } from "@/lib/data/ingestion";
import Payables from "@/components/payables/Payables";

export default async function PayablesPage() {
  const [rows, config, ingestion] = await Promise.all([
    getPayablesQueue(),
    getCodingConfig(),
    getIngestionLog(),
  ]);
  return (
    <Payables
      initial={rows}
      accounts={config.accounts}
      gls={config.gls}
      bcCategories={config.bcCategories}
      ingestion={ingestion}
    />
  );
}
