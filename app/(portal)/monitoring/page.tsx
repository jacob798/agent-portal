// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import Placeholder from "@/components/Placeholder";
import { requireModule } from "@/lib/auth/guard";

export default async function MonitoringPage() {
  await requireModule("monitoring");
  return (
    <Placeholder
      title="Monitoring"
      note="Run logs, heartbeats, and system metrics will live here."
    />
  );
}
