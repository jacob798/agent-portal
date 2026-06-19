"use client";

import { useState } from "react";
import type { RowQuestion } from "@/lib/data/payables";

/**
 * An inline question the system raised on a row (e.g. a $0 cost) — answered RIGHT HERE instead of
 * being parked in a dead-end "needs review" state. An "amount" option opens a small input; any
 * other option commits directly. Shared by the Travel ledger and the Payables queue.
 */
export function InlineQuestion({
  q,
  onAnswer,
}: {
  q: RowQuestion;
  onAnswer: (optionId: string, amount?: number) => void;
}) {
  const [entering, setEntering] = useState(false);
  const [val, setVal] = useState("");
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
      <span className="font-medium">{q.prompt}</span>
      {entering ? (
        <span className="flex items-center gap-1">
          <span className="text-amber-600">$</span>
          <input
            autoFocus
            value={val}
            onChange={(ev) => setVal(ev.target.value)}
            inputMode="decimal"
            className="w-20 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-slate-800"
            placeholder="0.00"
          />
          <button
            onClick={() => {
              const n = Number(val);
              if (Number.isFinite(n) && n >= 0) onAnswer("enter_amount", n);
            }}
            className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700"
          >
            Save
          </button>
          <button onClick={() => setEntering(false)} className="text-amber-600 hover:underline">
            cancel
          </button>
        </span>
      ) : (
        q.options.map((o) => (
          <button
            key={o.id}
            onClick={() => (o.input === "amount" ? setEntering(true) : onAnswer(o.id))}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-700 hover:bg-amber-100"
          >
            {o.label}
          </button>
        ))
      )}
    </div>
  );
}
