"use client";

import { usePathname } from "next/navigation";
import { Database } from "lucide-react";
import { activeNavItem } from "./nav";

export default function Topbar() {
  const pathname = usePathname();
  const current = activeNavItem(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-8 backdrop-blur">
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <span className="text-slate-400">Portal</span>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-brand-navy">
          {current?.label ?? "—"}
        </span>
      </nav>

      <div
        className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
        title="Showing mock data — not yet connected to the live backend."
      >
        <Database className="h-3.5 w-3.5" strokeWidth={2} />
        Mock data
      </div>
    </header>
  );
}
