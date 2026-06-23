"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, isRole, type Role } from "@/lib/auth/roles";
import { isModuleKey } from "@/lib/auth/modules";
import { replaceModuleGrants } from "@/lib/auth/moduleGrants";
import { writeAudit } from "@/lib/auth/provisioning";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Caller must hold manage_users. Returns the admin's profile or null. */
async function requireAdmin() {
  const me = await getProfile();
  if (!me || !can(me.role, "manage_users")) return null;
  return me;
}

function cleanModules(keys: string[]): string[] {
  return [...new Set(keys)].filter((k) => isModuleKey(k));
}

/** Change a user's role. Requires manage_users; writes via the service role. */
export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "Not authorized." };
  if (!isRole(role)) return { ok: false, error: "Invalid role." };
  if (userId === me.id) {
    return { ok: false, error: "You cannot change your own role." };
  }

  if (!isSupabaseConfigured()) return { ok: true }; // mock mode: optimistic

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    actorId: me.id,
    actorEmail: me.email,
    action: "set_role",
    targetProfileId: userId,
    detail: { role },
  });
  revalidatePath("/admin");
  return { ok: true };
}

/** Replace a user's module grants. Requires manage_users. */
export async function setUserModules(
  userId: string,
  moduleKeys: string[],
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "Not authorized." };

  const keys = cleanModules(moduleKeys);
  const res = await replaceModuleGrants(userId, keys, me.id);
  if (!res.ok) return res;

  await writeAudit({
    actorId: me.id,
    actorEmail: me.email,
    action: "set_modules",
    targetProfileId: userId,
    detail: { modules: keys },
  });
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Provision a user by email. If a profile already exists for that email, apply
 * the role + modules directly; otherwise stage a pending invitation that the
 * new-user trigger applies on first SSO sign-in.
 */
export async function inviteUser(
  email: string,
  role: Role,
  moduleKeys: string[],
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "Not authorized." };

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!isRole(role)) return { ok: false, error: "Invalid role." };
  const keys = cleanModules(moduleKeys);

  if (!isSupabaseConfigured()) return { ok: true }; // mock mode

  const admin = createAdminClient();

  // Already a user? Apply directly instead of inviting.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (existing?.id) {
    if (existing.id === me.id) {
      return { ok: false, error: "That's you — edit your own access carefully elsewhere." };
    }
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (roleErr) return { ok: false, error: roleErr.message };
    const res = await replaceModuleGrants(existing.id, keys, me.id);
    if (!res.ok) return res;
    await writeAudit({
      actorId: me.id,
      actorEmail: me.email,
      action: "invite",
      targetProfileId: existing.id,
      targetEmail: cleanEmail,
      detail: { role, modules: keys, appliedToExisting: true },
    });
    revalidatePath("/admin");
    return { ok: true };
  }

  const { error } = await admin
    .from("pending_invitations")
    .upsert(
      {
        email: cleanEmail,
        role,
        modules: keys,
        invited_by: me.id,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    actorId: me.id,
    actorEmail: me.email,
    action: "invite",
    targetEmail: cleanEmail,
    detail: { role, modules: keys },
  });
  revalidatePath("/admin");
  return { ok: true };
}

/** Withdraw a pending invitation. Requires manage_users. */
export async function revokeInvite(email: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { ok: false, error: "Not authorized." };
  const cleanEmail = email.trim().toLowerCase();

  if (!isSupabaseConfigured()) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("pending_invitations")
    .delete()
    .eq("email", cleanEmail);
  if (error) return { ok: false, error: error.message };

  await writeAudit({
    actorId: me.id,
    actorEmail: me.email,
    action: "revoke_invite",
    targetEmail: cleanEmail,
  });
  revalidatePath("/admin");
  return { ok: true };
}
