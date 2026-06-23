export const dynamic = "force-dynamic";

import { getIngestExceptions, getTripOptions, DOC_TYPES_BY_PATHWAY } from "@/lib/data/ingestExceptions";
import IngestExceptions from "@/components/ingest/IngestExceptions";
import { requireModule } from "@/lib/auth/guard";

export default async function IngestExceptionsPage() {
  await requireModule("ingest-exceptions");
  const [{ items, counts }, trips] = await Promise.all([getIngestExceptions(), getTripOptions()]);
  return <IngestExceptions items={items} counts={counts} docTypes={DOC_TYPES_BY_PATHWAY} trips={trips} />;
}
