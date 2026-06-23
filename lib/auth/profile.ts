import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { type Role, type Capability, can, isRole } from "@/lib/auth/roles";
import { isOwnerEmail, ownerEmails } from "@/lib/auth/owner";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

// Re-export so existing imports of isOwnerEmail from this module keep working.
export { isOwnerEmail };

/** Demo profile shown when Supabase isn't configured yet (mock mode). */
const DEMO_PROFILE: Profile = {
  id: "demo",
  email: ownerEmails()[0] ?? "owner@foundry-capital.co",
  displayName: "Jacob Wolbach",
  role: "admin",
};

/**
 * In mock mode, DEMO_USER=operator|viewer lets you sign in "as" a restricted
 * mock user to exercise per-module access in the browser. Defaults to the
 * owner/admin demo profile. Has no effect once Supabase is configured.
 */
function mockProfile(): Profile {
  const who = (process.env.DEMO_USER ?? "").toLowerCase();
  if (who === "operator") return MOCK_PROFILES[1];
  if (who === "viewer") return MOCK_PROFILES[2];
  return DEMO_PROFILE;
}

/**
 * The current user's profile, or null if not signed in.
 * In mock mode (no Supabase) returns a demo admin so the UI is populated.
 * The owner-email allowlist overrides the stored role to `admin`.
 */
export async function getProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return mockProfile();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("profiles")
    .select("id, email, display_name, role")
    .eq("id", user.id)
    .single();

  const owner = isOwnerEmail(user.email);
  const storedRole = isRole(row?.role) ? row.role : "viewer";

  return {
    id: user.id,
    email: user.email ?? row?.email ?? "",
    displayName: row?.display_name ?? user.email ?? "User",
    role: owner ? "admin" : storedRole,
  };
}

/** Convenience capability check for the current user. */
export async function currentUserCan(capability: Capability): Promise<boolean> {
  const profile = await getProfile();
  return !!profile && can(profile.role, capability);
}

/** All profiles (admin list). Mock list when Supabase isn't configured. */
export async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured()) return MOCK_PROFILES;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role")
    .order("display_name");
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    email: r.email ?? "",
    displayName: r.display_name ?? r.email ?? "User",
    role: isRole(r.role) ? r.role : "viewer",
  }));
}

const MOCK_PROFILES: Profile[] = [
  { id: "u1", email: "jacob@foundry-capital.co", displayName: "Jacob Wolbach", role: "admin" },
  { id: "u2", email: "analyst@foundry-capital.co", displayName: "Dana Reyes", role: "operator" },
  { id: "u3", email: "viewer@foundry-capital.co", displayName: "Sam Park", role: "viewer" },
];
