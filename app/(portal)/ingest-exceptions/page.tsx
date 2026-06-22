export const dynamic = "force-dynamic";

import { getIngestExceptions, getTripOptions, DOC_TYPES_BY_PATHWAY } from "@/lib/data/ingestExceptions";
import IngestExceptions from "@/components/ingest/IngestExceptions";

export default async function IngestExceptionsPage() {
  const [{ items, counts }, trips] = await Promise.all([getIngestExceptions(), getTripOptions()]);
  return <IngestExceptions items={items} counts={counts} docTypes={DOC_TYPES_BY_PATHWAY} trips={trips} />;
}
