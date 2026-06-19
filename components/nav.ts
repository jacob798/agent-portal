import {
  LayoutDashboard,
  Inbox,
  Activity,
  Calculator,
  Plane,
  CreditCard,
  Receipt,
  BookOpenCheck,
  ClipboardCheck,
  Shield,
  Sparkles,
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
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/review-queue", label: "Review Queue", icon: ClipboardCheck },
      { href: "/monitoring", label: "Monitoring", icon: Activity },
    ],
  },
  {
    heading: "Agents",
    items: [
      { href: "/payables", label: "Payables", icon: CreditCard },
      { href: "/expense-reports", label: "Expense reports", icon: Receipt },
      { href: "/travel", label: "Travel", icon: Plane },
      { href: "/bookkeeper", label: "Bookkeeper", icon: BookOpenCheck },
      { href: "/valuation", label: "Valuation", icon: Calculator },
    ],
  },
  {
    heading: "Settings",
    items: [
      { href: "/rules", label: "Rules & Learning", icon: Sparkles },
      { href: "/admin", label: "Admin", icon: Shield },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Resolve the active nav item for a pathname (longest matching href wins). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
