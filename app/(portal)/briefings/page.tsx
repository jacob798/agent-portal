import { getBriefingsDrafts } from "@/lib/data/briefings";
import Briefings from "@/components/briefings/Briefings";

export default async function BriefingsPage() {
  const notes = await getBriefingsDrafts();
  return <Briefings initial={notes} />;
}
