// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { getBriefingsDrafts } from "@/lib/data/briefings";
import Briefings from "@/components/briefings/Briefings";
import { requireModule } from "@/lib/auth/guard";

export default async function BriefingsPage() {
  await requireModule("briefings");
  const notes = await getBriefingsDrafts();
  return <Briefings initial={notes} />;
}
