"use client";

export interface FilterTab {
  key: string;
  label: string;
  count?: number;
}

/** Segmented filter control. */
export default function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: FilterTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              on ? "bg-brand-navy text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 text-xs ${on ? "opacity-80" : "text-slate-400"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
