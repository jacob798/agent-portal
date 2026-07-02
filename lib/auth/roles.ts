/**
 * Roles and capabilities for the portal.
 *
 * Portal-wide access tiers (fit every agent, not just valuation):
 *   admin    — everything, incl. user/role management; sees ALL modules implicitly
 *   operator — read + act: submit jobs, approve/resolve queue, create, note, value
 *   viewer   — read-only
 *
 * Valuation-scoped tiers — the same capability shape as operator (+lock for underwriter),
 * but carried as their OWN roles so a valuation user can hold "lock" WITHOUT becoming a
 * portal admin (admin sees every module + manages users; these do neither). Which modules
 * they actually see is set separately by the per-user grant (profile_modules) — in practice
 * just `valuation`. The valuation app receives the role verbatim in the SSO token and maps
 * underwriter/analyst/viewer 1:1 (agents/valuation/core/portal_auth.py).
 *   underwriter — analyst + can lock/finalize a valuation
 *   analyst     — read + act + create (no lock, no user management)
 */

export const ROLES = [
  "admin",
  "operator",
  "viewer",
  "underwriter",
  "analyst",
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "read",
  "act",
  "create",
  "lock",
  "manage_users",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** capability -> roles allowed */
const CAPS: Record<Capability, ReadonlySet<Role>> = {
  read: new Set(["admin", "operator", "viewer", "underwriter", "analyst"]),
  act: new Set(["admin", "operator", "underwriter", "analyst"]),
  create: new Set(["admin", "operator", "underwriter", "analyst"]),
  lock: new Set(["admin", "underwriter"]), // underwriter can finalize; analyst cannot
  manage_users: new Set(["admin"]), // admin only — scoped roles never manage users
};

/** Whether a role is allowed to perform a capability. */
export function can(role: Role, capability: Capability): boolean {
  return CAPS[capability]?.has(role) ?? false;
}

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

/** Human label for a role. */
export function roleLabel(role: Role): string {
  return {
    admin: "Admin",
    operator: "Operator",
    viewer: "Viewer",
    underwriter: "Underwriter",
    analyst: "Analyst",
  }[role];
}
