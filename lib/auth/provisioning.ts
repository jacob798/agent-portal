import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Role } from "@/lib/auth/roles";

export interface PendingInvite {
  email: string;
  role: Role;
  modules: string[];
  invitedAt: string;
}

const MOCK_INVITES: PendingInvite[] = [
  {
    email: "newhire@foundry-capital.co",
    role: "operator",
    modules: ["payables", "travel"],
    invitedAt: "2026-06-23T00:00:00Z",
  },
];

/** Outstanding invitations (users provisioned but not yet signed in). */
export async function getPendingInvitations(): Promise<PendingInvite[]> {
  if (!isSupabaseConfigured()) return MOCK_INVITES;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_invitations")
    .select("email, role, modules, invited_at")
    .order("invited_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    email: r.email as string,
    role: (r.role as Role) ?? "viewer",
    modules: (r.modules as string[]) ?? [],
    invitedAt: (r.invited_at as string) ?? "",
  }));
}

/** Append an audit entry. Best-effort: never throws into the caller. */
export async function writeAudit(entry: {
  actorId: string;
  actorEmail: string;
  action: "set_role" | "set_modules" | "invite" | "revoke_invite";
  targetProfileId?: string | null;
  targetEmail?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    await admin.from("access_audit").insert({
      actor_id: entry.actorId || null,
      actor_email: entry.actorEmail || null,
      action: entry.action,
      target_profile_id: entry.targetProfileId ?? null,
      target_email: entry.targetEmail ?? null,
      detail: entry.detail ?? {},
    });
  } catch {
    // Audit must not block the operation.
  }
}
