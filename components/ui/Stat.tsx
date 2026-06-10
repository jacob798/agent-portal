import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  navy: "text-brand-navy",
  brand: "text-brand",
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  slate: "text-slate-900",
};

/** Compact metric card: big value + uppercase label. */
export default function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-semibold tracking-tight ${TONES[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}
