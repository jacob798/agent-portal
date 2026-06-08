"use client";

import { useMemo, useState } from "react";
import { Check, X, Inbox } from "lucide-react";
import {
  type ReviewItem,
  type ReviewStatus,
  type ReviewPriority,
} from "@/lib/data/review";
import { Badge, type Tone } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<ReviewPriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-slate-300",
};

const STATUS_TONE: Record<ReviewStatus, Tone> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
};

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: Filter[] = ["pending", "approved", "rejected", "all"];

function age(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function ReviewQueue({ initial }: { initial: ReviewItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("pending");

  const counts = useMemo(
    () => ({
      pending: items.filter((i) => i.status === "pending").length,
      approved: items.filter((i) => i.status === "approved").length,
      rejected: items.filter((i) => i.status === "rejected").length,
      all: items.length,
    }),
    [items],
  );

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  function resolve(id: string, status: ReviewStatus) {
    // Optimistic update. TODO(supabase): call resolveReviewItem(id, status).
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i)),
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
              filter === f
                ? "bg-brand-navy text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {f}
            <span
              className={`rounded px-1.5 text-xs ${
                filter === f
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="text-sm text-slate-500">
            Nothing {filter === "all" ? "in the queue" : `marked ${filter}`}.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {visible.map((item, idx) => (
            <div
              key={item.id}
              className={`flex items-start gap-4 px-5 py-4 ${
                idx > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              {/* Priority */}
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_TONE[item.priority]}`}
                title={`${item.priority} priority`}
              />

              {/* Body */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="indigo">{item.agentLabel}</Badge>
                  {item.entity && <Badge tone="neutral">{item.entity}</Badge>}
                  {item.status !== "pending" && (
                    <Badge tone={STATUS_TONE[item.status]} dot>
                      {item.status}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">
                  {item.title}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  {item.summary}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                  <span>{age(item.createdAt)} old</span>
                  {item.amount != null && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-slate-600">
                        {money(item.amount)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              {item.status === "pending" && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => resolve(item.id, "approved")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Approve
                  </button>
                  <button
                    onClick={() => resolve(item.id, "rejected")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
