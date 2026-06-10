import { getLedger } from "@/lib/data/bookkeeper";
import Bookkeeper from "@/components/bookkeeper/Bookkeeper";

export default async function BookkeeperPage() {
  const rows = await getLedger();
  return <Bookkeeper initial={rows} />;
}
