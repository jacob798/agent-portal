"use client";

import { useState, useTransition } from "react";
import { Check, X, Inbox as InboxIcon, Send } from "lucide-react";
import type { OperatorAction } from "@/lib/data/actions";
import { resolveAction } from "@/app/(portal)/inbox/actions";
import { Badge } from "@/components/ui/Badge";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-slate-300",
};

function age(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Inbox({ initial }: { initial: OperatorAction[] }) {
  const [actions, setActions] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve(id: string, decision: Record<string, unknown>) {
    const prev = actions;
    setActions((a) => a.filter((x) => x.id !== id)); // optimistic remove
    setError(null);
    startTransition(async () => {
      const res = await resolveAction(id, decision);
      if (!res.ok) {
        setActions(prev);
        setError(res.error ?? "Failed to resolve.");
      }
    });
  }

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-10 py-20 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
          <Check className="h-6 w-6" strokeWidth={2} />
        </span>
        <p className="text-sm font-medium text-slate-900">All caught up</p>
        <p className="mt-1 text-sm text-slate-500">
          No actions waiting on you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      )}
      {actions.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[a.priority]}`}
              title={`${a.priority} priority`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="indigo">{a.agentLabel}</Badge>
                {a.entity && <Badge tone="neutral">{a.entity}</Badge>}
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  {a.type}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">
                {a.title}
              </p>
              {a.body && (
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  {a.body}
                </p>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                <span>{age(a.createdAt)} old</span>
                {a.amount != null && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-slate-600">
                      {money(a.amount)}
                    </span>
                  </>
                )}
              </div>

              {/* Type-specific control */}
              <div className="mt-4">
                <ActionControl
                  action={a}
                  disabled={pending}
                  onResolve={(d) => resolve(a.id, d)}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionControl({
  action,
  disabled,
  onResolve,
}: {
  action: OperatorAction;
  disabled: boolean;
  onResolve: (decision: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState("");

  if (action.type === "approval") {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={disabled}
          onClick={() => onResolve({ action: "approved" })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Approve
        </button>
        <button
          disabled={disabled}
          onClick={() => onResolve({ action: "rejected" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} /> Reject
        </button>
      </div>
    );
  }

  if (action.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {action.options.map((opt) => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onResolve({ choice: opt.value })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand hover:bg-brand/5 hover:text-brand-navy disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (action.type === "input") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onResolve({ input: text.trim() });
        }}
        className="flex items-center gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="Type a response…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2} /> Submit
        </button>
      </form>
    );
  }

  // alert
  return (
    <button
      disabled={disabled}
      onClick={() => onResolve({ acknowledged: true })}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" strokeWidth={2} /> Acknowledge
    </button>
  );
}
