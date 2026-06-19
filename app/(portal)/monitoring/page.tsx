// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import Placeholder from "@/components/Placeholder";

export default function MonitoringPage() {
  return (
    <Placeholder
      title="Monitoring"
      note="Run logs, heartbeats, and system metrics will live here."
    />
  );
}
