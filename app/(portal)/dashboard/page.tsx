import { getAgents, type AgentStatus } from "@/lib/data/agents";

const STATUS_STYLES: Record<AgentStatus, { dot: string; label: string; text: string }> = {
  healthy: { dot: "bg-green-500", label: "Healthy", text: "text-green-700" },
  degraded: { dot: "bg-amber-500", label: "Degraded", text: "text-amber-700" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-700" },
  idle: { dot: "bg-gray-400", label: "Idle", text: "text-gray-600" },
};

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function DashboardPage() {
  const agents = await getAgents();

  const counts = agents.reduce(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {} as Record<AgentStatus, number>,
  );
  const totalQueue = agents.reduce((sum, a) => sum + a.queueDepth, 0);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Agent Health</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live status across all agents.
        </p>
      </header>

      {/* Summary strip */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Agents" value={agents.length} />
        <SummaryCard label="Healthy" value={counts.healthy ?? 0} accent="text-green-700" />
        <SummaryCard label="Need attention" value={(counts.degraded ?? 0) + (counts.down ?? 0)} accent="text-amber-700" />
        <SummaryCard label="Queued items" value={totalQueue} />
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const s = STATUS_STYLES[agent.status];
          return (
            <div
              key={agent.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  {agent.name}
                </h2>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">{agent.description}</p>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                <span>Last run: {formatLastRun(agent.lastRunAt)}</span>
                <span>
                  Queue:{" "}
                  <span className="font-medium text-gray-900">
                    {agent.queueDepth}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = "text-gray-900",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
