import { getTravel } from "@/lib/data/travel";
import Travel from "@/components/travel/Travel";

export default async function TravelPage() {
  const { trips, queue } = await getTravel();
  return <Travel trips={trips} queue={queue} />;
}
