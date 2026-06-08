import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { getAgents, type AgentStatus } from "@/lib/data/agents";
import { Badge, type Tone } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";

const STATUS: Record<AgentStatus, { tone: Tone; label: string }> = {
  healthy: { tone: "green", label: "Healthy" },
  degraded: { tone: "amber", label: "Degraded" },
  down: { tone: "red", label: "Down" },
  idle: { tone: "neutral", label: "Idle" },
};

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
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
  const attention = (counts.degraded ?? 0) + (counts.down ?? 0);
  const totalQueue = agents.reduce((sum, a) => sum + a.queueDepth, 0);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="Agent Health"
        subtitle="Live status across every agent in the system."
      />

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Activity} label="Agents" value={agents.length} tone="indigo" />
        <Stat icon={CheckCircle2} label="Healthy" value={counts.healthy ?? 0} tone="green" />
        <Stat icon={AlertTriangle} label="Need attention" value={attention} tone={attention ? "amber" : "neutral"} />
        <Stat icon={Inbox} label="Queued items" value={totalQueue} tone="indigo" />
      </div>

      {/* Agent grid */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const s = STATUS[agent.status];
          return (
            <div
              key={agent.id}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  {agent.name}
                </h2>
                <Badge tone={s.tone} dot>
                  {s.label}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {agent.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>Last run · {formatLastRun(agent.lastRunAt)}</span>
                <span className="inline-flex items-center gap-1">
                  Queue
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-semibold ${
                      agent.queueDepth > 0
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-400"
                    }`}
                  >
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

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: Tone;
}) {
  const iconTone: Record<Tone, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    neutral: "bg-slate-100 text-slate-500",
    slate: "bg-slate-100 text-slate-500",
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconTone[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-2xl font-semibold tracking-tight text-slate-900">
          {value}
        </div>
      </div>
    </div>
  );
}
