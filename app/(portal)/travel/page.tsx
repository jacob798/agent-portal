import { getTravel, getNeedsTrip } from "@/lib/data/travel";
import Travel from "@/components/travel/Travel";

export default async function TravelPage() {
  const [{ trips }, needsTrip] = await Promise.all([getTravel(), getNeedsTrip()]);
  return <Travel trips={trips} needsTrip={needsTrip} />;
}
