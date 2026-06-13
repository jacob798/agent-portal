import { getTravel } from "@/lib/data/travel";
import Travel from "@/components/travel/Travel";

export default async function TravelPage() {
  const { trips } = await getTravel();
  return <Travel trips={trips} />;
}
