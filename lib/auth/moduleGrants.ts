import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MODULES } from "@/lib/auth/modules";

/**
 * Module grants persisted in public.profile_modules (profile_id, module_key).
 * A grant makes a module visible/usable for that user; the user's ROLE still
 * decides what they can do inside it (read vs act). Admins/owners bypass grants
 * entirely (see canAccessModule).
 */

/** Dev-only mock grants so per-user restriction is demonstrable without a DB.
 *  Active only in mock mode (Supabase not configured). Keyed by mock profile id. */
const MOCK_GRANTS: Record<string, string[]> = {
  // u2 = Dana (operator): a trimmed operations + payables/travel set.
  u2: ["inbox", "review-queue", "payables", "expense-reports", "travel"],
  // u3 = Sam (viewer): payables + travel only.
  u3: ["payables", "travel"],
};

/** The set of module keys granted to a profile (excludes alwaysOn/admin-implicit). */
export async function getModuleGrants(
  profileId: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured()) {
    return new Set(MOCK_GRANTS[profileId] ?? []);
  }
  // Reads the caller's own rows under RLS via the request-scoped client.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_modules")
    .select("module_key")
    .eq("profile_id", profileId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.module_key as string));
}

/** Admin read of any profile's grants (service role, bypasses RLS). */
export async function getModuleGrantsAdmin(
  profileId: string,
): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set(MOCK_GRANTS[profileId] ?? []);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_modules")
    .select("module_key")
    .eq("profile_id", profileId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.module_key as string));
}

/** Grants for every profile, as a map id -> Set<key> (admin list view). */
export async function getAllModuleGrants(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!isSupabaseConfigured()) {
    for (const [id, keys] of Object.entries(MOCK_GRANTS)) {
      out.set(id, new Set(keys));
    }
    return out;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profile_modules")
    .select("profile_id, module_key");
  if (error || !data) return out;
  for (const r of data) {
    const id = r.profile_id as string;
    if (!out.has(id)) out.set(id, new Set());
    out.get(id)!.add(r.module_key as string);
  }
  return out;
}

const VALID_KEYS = new Set(MODULES.map((m) => m.key));

/** Replace a profile's grant set wholesale (admin action). Service role. */
export async function replaceModuleGrants(
  profileId: string,
  moduleKeys: string[],
  grantedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const keys = [...new Set(moduleKeys)].filter((k) => VALID_KEYS.has(k));
  if (!isSupabaseConfigured()) return { ok: true }; // mock mode: optimistic
  const admin = createAdminClient();

  const { error: delErr } = await admin
    .from("profile_modules")
    .delete()
    .eq("profile_id", profileId);
  if (delErr) return { ok: false, error: delErr.message };

  if (keys.length) {
    const rows = keys.map((module_key) => ({
      profile_id: profileId,
      module_key,
      granted_by: grantedBy || null,
    }));
    const { error: insErr } = await admin.from("profile_modules").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }
  return { ok: true };
}
