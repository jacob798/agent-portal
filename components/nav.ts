import {
  Home,
  Inbox,
  Activity,
  Calculator,
  Plane,
  RadioTower,
  CreditCard,
  Receipt,
  BookOpenCheck,
  ClipboardCheck,
  Shield,
  Sparkles,
  HandCoins,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { MODULES, type ModuleDef } from "@/lib/auth/modules";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Module key this nav item maps to (for per-user filtering). */
  moduleKey: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/** Icon per module key. Icons live here (client) so lib/auth/modules.ts stays
 *  edge-safe and importable from middleware. */
const ICONS: Record<string, LucideIcon> = {
  dashboard: Home,
  inbox: Inbox,
  "ingest-exceptions": RadioTower,
  "review-queue": ClipboardCheck,
  monitoring: Activity,
  payables: CreditCard,
  "expense-reports": Receipt,
  travel: Plane,
  bookkeeper: BookOpenCheck,
  valuation: Calculator,
  "bc-reimbursement": HandCoins,
  briefings: Mic,
  rules: Sparkles,
  admin: Shield,
};

const SECTION_ORDER: NavSection["heading"][] = [
  "Operations",
  "Agents",
  "Settings",
];

function toItem(m: ModuleDef): NavItem {
  return {
    href: m.route,
    label: m.label,
    icon: ICONS[m.key] ?? Home,
    moduleKey: m.key,
  };
}

/** Build the nav sections from the registry, optionally filtered to a set of
 *  module keys the current user may access. Single source of truth = MODULES. */
export function buildNavSections(allowed?: ReadonlySet<string>): NavSection[] {
  const sections: NavSection[] = [];
  for (const heading of SECTION_ORDER) {
    const items = MODULES.filter(
      (m) =>
        m.inNav &&
        m.section === heading &&
        (!allowed || allowed.has(m.key)),
    ).map(toItem);
    if (items.length) sections.push({ heading, items });
  }
  return sections;
}

/** Full nav (unfiltered) — used where access filtering isn't applied. */
export const NAV_SECTIONS: NavSection[] = buildNavSections();

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Resolve the active nav item for a pathname (longest matching href wins). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
