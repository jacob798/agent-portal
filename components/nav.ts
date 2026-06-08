import {
  LayoutDashboard,
  ListChecks,
  Activity,
  Calculator,
  Plane,
  Shield,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/** Single source of truth for navigation — used by the sidebar and context bar. */
export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/review-queue", label: "Review Queue", icon: ListChecks },
      { href: "/monitoring", label: "Monitoring", icon: Activity },
    ],
  },
  {
    heading: "Agents",
    items: [
      { href: "/valuation", label: "Valuation", icon: Calculator },
      { href: "/travel", label: "Travel", icon: Plane },
    ],
  },
  {
    heading: "Settings",
    items: [{ href: "/admin", label: "Admin", icon: Shield }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Resolve the active nav item for a pathname (longest matching href wins). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
