"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { buildNavSections } from "./nav";
import { LogoMark } from "./Logo";

interface SidebarUser {
  displayName: string;
  email: string;
  roleLabel: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const STORAGE_KEY = "portal:navCollapsed";

export default function Sidebar({
  user,
  allowedModules,
}: {
  user: SidebarUser | null;
  /** Module keys the user may see. Omit/undefined = show all (e.g. mock mode fallback). */
  allowedModules?: string[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navSections = buildNavSections(
    allowedModules ? new Set(allowedModules) : undefined,
  );

  // Restore the collapsed preference on mount; persist on change.
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand */}
      <div
        className={`flex h-16 items-center gap-3 ${collapsed ? "justify-center px-0" : "px-5"}`}
      >
        <LogoMark className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-brand-navy">
              Foundry Capital
            </span>
            <span className="mt-1 text-[11px] font-medium text-slate-400">
              Agent Portal
            </span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.heading}>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-brand/10 text-brand-navy"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon
                      className={`h-4.5 w-4.5 shrink-0 ${
                        active
                          ? "text-brand"
                          : "text-slate-400 group-hover:text-slate-600"
                      }`}
                      strokeWidth={2}
                    />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex items-center gap-3 border-t border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        ) : (
          <>
            <PanelLeftClose className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
            Collapse
          </>
        )}
      </button>

      {/* User / sign out */}
      {user && (
        <div className="border-t border-slate-200 p-3">
          <div
            className={`flex items-center gap-3 rounded-lg py-1.5 ${collapsed ? "justify-center px-0" : "px-2"}`}
          >
            <span
              title={collapsed ? `${user.displayName} · ${user.roleLabel}` : undefined}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white"
            >
              {initials(user.displayName)}
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {user.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {user.roleLabel}
                  </p>
                </div>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    title="Sign out"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={2} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
