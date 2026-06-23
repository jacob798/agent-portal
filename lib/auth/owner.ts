/**
 * Owner-email allowlist. Emails here are always treated as `admin` and have
 * access to every module — the bootstrap that makes it impossible to lock
 * yourself out. Set PORTAL_OWNER_EMAILS (comma-separated).
 *
 * Kept in its own edge-safe module (no "server-only", no Supabase) so it can
 * be imported from middleware as well as from server code.
 */
export function ownerEmails(): string[] {
  return (process.env.PORTAL_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && ownerEmails().includes(email.toLowerCase());
}
