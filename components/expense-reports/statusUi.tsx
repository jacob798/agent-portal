import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { ReportStatus } from "@/lib/data/expenseReportsShared";

/** Status badge — colors per spec:
 *  Draft grey · Submitted blue (#E6F1FB/#0C447C) · Reimbursed green (#d0f0c0/#177245) · Generated grey. */
export function StatusBadge({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, { bg: string; fg: string; label: string }> = {
    draft: { bg: "#F1F5F9", fg: "#475569", label: "Draft" },
    generated: { bg: "#F1F5F9", fg: "#475569", label: "Generated" },
    submitted: { bg: "#E6F1FB", fg: "#0C447C", label: "Submitted" },
    reimbursed: { bg: "#d0f0c0", fg: "#177245", label: "Reimbursed" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

const STEPS: { key: ReportStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "generated", label: "Generated" },
  { key: "submitted", label: "Submitted" },
  { key: "reimbursed", label: "Reimbursed" },
];

const ORDER: Record<ReportStatus, number> = { draft: 0, generated: 1, submitted: 2, reimbursed: 3 };

/** The status stepper shown on the report detail: completed = green check, current = highlighted,
 *  future = grey. */
export function StatusStepper({ status }: { status: ReportStatus }): ReactNode {
  const cur = ORDER[status];
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const idx = ORDER[step.key];
        const done = idx < cur;
        const isCurrent = idx === cur;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                style={
                  done
                    ? { backgroundColor: "#177245", color: "#fff" }
                    : isCurrent
                      ? { backgroundColor: "#10102e", color: "#fff" }
                      : { backgroundColor: "#E2E8F0", color: "#94A3B8" }
                }
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: done ? "#177245" : isCurrent ? "#10102e" : "#94A3B8" }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="h-px w-6" style={{ backgroundColor: idx < cur ? "#177245" : "#E2E8F0" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
