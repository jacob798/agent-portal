// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getPayablesQueue, getVendors, getTrips, getDocTypes } from "@/lib/data/payables";
import { getCodingConfig } from "@/lib/data/config";
import { getIngestionLog } from "@/lib/data/ingestion";
import Payables from "@/components/payables/Payables";
import { requireModule } from "@/lib/auth/guard";

export default async function PayablesPage() {
  await requireModule("payables");
  const [rows, config, ingestion, vendors, trips, docTypes] = await Promise.all([
    getPayablesQueue(),
    getCodingConfig(),
    getIngestionLog(),
    getVendors(),
    getTrips(),
    getDocTypes(),
  ]);
  return (
    <Payables
      initial={rows}
      accounts={config.accounts}
      gls={config.gls}
      bcCategories={config.bcCategories}
      ingestion={ingestion}
      vendors={vendors}
      trips={trips}
      docTypes={docTypes}
    />
  );
}
