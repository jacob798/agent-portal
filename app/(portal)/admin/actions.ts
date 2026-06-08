"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, isRole, type Role } from "@/lib/auth/roles";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Change a user's role. Requires manage_users; writes via the service role. */
export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const me = await getProfile();
  if (!me || !can(me.role, "manage_users")) {
    return { ok: false, error: "Not authorized." };
  }
  if (!isRole(role)) {
    return { ok: false, error: "Invalid role." };
  }
  if (userId === me.id) {
    return { ok: false, error: "You cannot change your own role." };
  }

  // Mock mode: no backend yet — the client keeps its optimistic update.
  if (!isSupabaseConfigured()) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
