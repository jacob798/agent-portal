"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/auth/roles";

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

/**
 * Record an operator's decision on an action. The `decision` shape depends on
 * the action type: {action:'approved'|'rejected'} | {choice:value} | {input:text}
 * | {acknowledged:true}. Requires the `act` capability.
 */
export async function resolveAction(
  id: string,
  decision: Record<string, unknown>,
): Promise<ResolveResult> {
  const me = await getProfile();
  if (!me || !can(me.role, "act")) {
    return { ok: false, error: "Not authorized to resolve actions." };
  }

  // Mock mode: the client keeps its optimistic update.
  if (!isSupabaseConfigured()) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("operator_actions")
    .update({
      status: "resolved",
      decision,
      decided_by: me.id === "demo" ? null : me.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}
