/**
 * Canonical module registry — the SINGLE source of truth for which agent
 * modules exist, where they live, and who gets them by default.
 *
 * Nav (components/nav.ts), the middleware route gate, the page guards, and the
 * API guards ALL derive from this list so they can never drift. Keep this file
 * edge-safe: no "server-only", no Supabase, no React/lucide imports (icons are
 * attached in components/nav.ts) so middleware can import it.
 */
import type { Role } from "@/lib/auth/roles";

export interface ModuleDef {
  /** Stable key stored in profile_modules.module_key and pending_invitations.modules. */
  key: string;
  /** Sidebar label. */
  label: string;
  /** Route prefix that this module owns (pages + the matching /api/* prefix). */
  route: string;
  /** Nav grouping. */
  section: "Operations" | "Agents" | "Settings";
  /** Roles that receive this module by default (invite presets + existing-user backfill). */
  defaultRoles: Role[];
  /** Granted to every signed-in user implicitly (the landing module). */
  alwaysOn?: boolean;
  /** Governed by the manage_users capability, not by a per-user grant. */
  adminOnly?: boolean;
  /** Shown in the sidebar. Routes that exist but aren't in the nav set this false. */
  inNav?: boolean;
}

const ALL_ROLES: Role[] = ["admin", "operator", "viewer"];

/**
 * The registry. `defaultRoles: ALL_ROLES` on the non-admin modules preserves
 * today's "everyone sees everything" behavior for existing users via the
 * migration backfill; new (uninvited) users get only the alwaysOn Dashboard.
 */
export const MODULES: ModuleDef[] = [
  // Operations
  { key: "dashboard", label: "Dashboard", route: "/dashboard", section: "Operations", defaultRoles: ALL_ROLES, alwaysOn: true, inNav: true },
  { key: "inbox", label: "Inbox", route: "/inbox", section: "Operations", defaultRoles: ALL_ROLES, inNav: true },
  { key: "ingest-exceptions", label: "Ingest Exceptions", route: "/ingest-exceptions", section: "Operations", defaultRoles: ALL_ROLES, inNav: true },
  { key: "review-queue", label: "Review Queue", route: "/review-queue", section: "Operations", defaultRoles: ALL_ROLES, inNav: true },
  { key: "monitoring", label: "Monitoring", route: "/monitoring", section: "Operations", defaultRoles: ALL_ROLES, inNav: true },
  // Agents
  { key: "payables", label: "Payables", route: "/payables", section: "Agents", defaultRoles: ALL_ROLES, inNav: true },
  { key: "expense-reports", label: "Expense reports", route: "/expense-reports", section: "Agents", defaultRoles: ALL_ROLES, inNav: true },
  { key: "travel", label: "Travel", route: "/travel", section: "Agents", defaultRoles: ALL_ROLES, inNav: true },
  { key: "bookkeeper", label: "Bookkeeper", route: "/bookkeeper", section: "Agents", defaultRoles: ALL_ROLES, inNav: true },
  { key: "valuation", label: "Valuation", route: "/valuation", section: "Agents", defaultRoles: ALL_ROLES, inNav: true },
  { key: "bc-reimbursement", label: "BC Reimbursement", route: "/bc-reimbursement", section: "Agents", defaultRoles: ALL_ROLES, inNav: false },
  { key: "briefings", label: "Briefings", route: "/briefings", section: "Agents", defaultRoles: ALL_ROLES, inNav: false },
  // Settings
  { key: "rules", label: "Rules & Learning", route: "/rules", section: "Settings", defaultRoles: ALL_ROLES, inNav: true },
  { key: "admin", label: "Admin", route: "/admin", section: "Settings", defaultRoles: ["admin"], adminOnly: true, inNav: true },
];

export type ModuleKey = string;

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function moduleByKey(key: string): ModuleDef | undefined {
  return BY_KEY.get(key);
}

export function isModuleKey(value: unknown): value is string {
  return typeof value === "string" && BY_KEY.has(value);
}

/** Modules an admin can actually grant per-user (excludes alwaysOn + adminOnly). */
export function grantableModules(): ModuleDef[] {
  return MODULES.filter((m) => !m.alwaysOn && !m.adminOnly);
}

/** The default grant set for a role (used for invite presets + backfill). */
export function defaultModulesForRole(role: Role): string[] {
  return grantableModules()
    .filter((m) => m.defaultRoles.includes(role))
    .map((m) => m.key);
}

/**
 * Map a request path to the module key that owns it, for pages AND API routes.
 * Returns undefined for paths that no module gates (public/auth/webhook/unknown).
 */
const API_SEGMENT_TO_MODULE: Record<string, string | null> = {
  payables: "payables",
  travel: "travel",
  "expense-reports": "expense-reports",
  ingest: "inbox", // the upload endpoint the Inbox module drives
  "ingest-exceptions": "ingest-exceptions",
  rules: "rules",
  "vendor-rule": "rules",
  briefings: "briefings",
  // Intentionally ungated (no user session / own secret):
  webhooks: null,
  auth: null,
};

export function moduleForPath(pathname: string): string | undefined {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts.length === 0) return undefined; // root

  if (parts[0] === "api") {
    const seg = parts[1];
    if (seg === undefined) return undefined;
    if (seg in API_SEGMENT_TO_MODULE) {
      return API_SEGMENT_TO_MODULE[seg] ?? undefined;
    }
    return undefined; // unmapped API route: not module-gated
  }

  // Page route: first segment is the module key.
  return BY_KEY.has(parts[0]) ? parts[0] : undefined;
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Pure access decision. `grantedKeys` is the user's set of granted module keys
 * (from profile_modules). Admins/owners (resolved to role "admin") get all
 * modules; alwaysOn modules are open to everyone signed in.
 */
export function canAccessModule(
  opts: { role: Role; isOwner?: boolean },
  grantedKeys: ReadonlySet<string>,
  moduleKey: string,
): boolean {
  const m = BY_KEY.get(moduleKey);
  if (!m) return false;
  if (opts.role === "admin" || opts.isOwner) return true;
  if (m.adminOnly) return false; // only admins/owners (handled above)
  if (m.alwaysOn) return true;
  return grantedKeys.has(moduleKey);
}
