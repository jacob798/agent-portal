/**
 * Roles and capabilities for the portal.
 *
 * Ported 1:1 from agent-system's agents/valuation/core/auth.py so both
 * surfaces agree on who-can-do-what. Keep this in sync with that file.
 *
 *   underwriter (full, incl. lock) > analyst (create/value/note) > viewer (read)
 */

export const ROLES = ["underwriter", "analyst", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "read",
  "note",
  "value",
  "create",
  "lock",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** capability -> roles allowed (mirrors _CAPS in auth.py) */
const CAPS: Record<Capability, ReadonlySet<Role>> = {
  read: new Set(["underwriter", "analyst", "viewer"]),
  note: new Set(["underwriter", "analyst"]),
  value: new Set(["underwriter", "analyst"]),
  create: new Set(["underwriter", "analyst"]),
  lock: new Set(["underwriter"]),
};

/** Whether a role is allowed to perform a capability. */
export function can(role: Role, capability: Capability): boolean {
  return CAPS[capability]?.has(role) ?? false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
