// The portal landing — a launcher showing only the modules this user can open.
// Render fresh so a grant change reflects on the next load.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Inbox,
  RadioTower,
  ClipboardCheck,
  Activity,
  CreditCard,
  Receipt,
  Plane,
  BookOpenCheck,
  Calculator,
  HandCoins,
  Mic,
  Sparkles,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { getProfile } from "@/lib/auth/profile";
import { getModuleGrants } from "@/lib/auth/moduleGrants";
import { isOwnerEmail } from "@/lib/auth/owner";
import { canAccessModule, MODULES } from "@/lib/auth/modules";
import PageHeader from "@/components/ui/PageHeader";

// Icon + one-line purpose per module. Icons mirror components/nav.ts.
const ICONS: Record<string, LucideIcon> = {
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

const BLURB: Record<string, string> = {
  inbox: "Upload and route documents.",
  "ingest-exceptions": "Fix routing and parse gaps.",
  "review-queue": "Resolve flagged items.",
  monitoring: "Agent health and recent runs.",
  payables: "Invoices, coding, and posting.",
  "expense-reports": "Build and reconcile BCX reports.",
  travel: "Trips, itineraries, and expenses.",
  bookkeeper: "QuickBooks posting and reconciliation.",
  valuation: "Construction-loan valuations.",
  "bc-reimbursement": "Builders Capital reimbursements.",
  briefings: "Capture and route briefings.",
  rules: "Vendor and doc-type rules.",
  admin: "Users and access.",
};

const SECTION_ORDER = ["Operations", "Agents", "Settings"] as const;

export default async function HomePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const grants = await getModuleGrants(profile.id);
  const ctx = { role: profile.role, isOwner: isOwnerEmail(profile.email) };

  // Only the modules this user can actually open (nav-eligible, minus the home card itself).
  const mods = MODULES.filter(
    (m) => m.inNav && m.key !== "dashboard" && canAccessModule(ctx, grants, m.key),
  );

  // Scope-aware landing: a user with exactly one module skips the launcher and drops
  // straight into it (e.g. a valuation-only underwriter → /valuation).
  if (mods.length === 1) redirect(mods[0].route);

  const sections = SECTION_ORDER.map((heading) => ({
    heading,
    items: mods.filter((m) => m.section === heading),
  })).filter((s) => s.items.length);

  const firstName = (profile.displayName || "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader title={`Welcome, ${firstName}`} subtitle="Jump into any of your tools." />

      <div className="mt-6 space-y-8">
        {sections.map((section) => (
          <div key={section.heading}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {section.heading}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((m) => {
                const Icon = ICONS[m.key] ?? Calculator;
                return (
                  <Link
                    key={m.key}
                    href={m.route}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <h2 className="mt-4 text-sm font-semibold text-slate-900">{m.label}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{BLURB[m.key] ?? ""}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
