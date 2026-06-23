import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getProfile, type Profile } from "@/lib/auth/profile";
import { getModuleGrants } from "@/lib/auth/moduleGrants";
import { isOwnerEmail } from "@/lib/auth/owner";
import { canAccessModule, MODULES } from "@/lib/auth/modules";
import { can, type Capability } from "@/lib/auth/roles";

/**
 * Server-side route guard. Call at the top of a protected Server Component /
 * layout. Redirects to /login if signed out, or /dashboard if the user lacks
 * the capability. Returns the profile so the caller can use it.
 */
export async function requireCapability(capability: Capability) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!can(profile.role, capability)) redirect("/dashboard");
  return profile;
}

async function hasModule(profile: Profile, moduleKey: string): Promise<boolean> {
  const grants = await getModuleGrants(profile.id);
  return canAccessModule(
    { role: profile.role, isOwner: isOwnerEmail(profile.email) },
    grants,
    moduleKey,
  );
}

/** Nav-eligible module keys for the current user (for the sidebar). */
export async function accessibleNavKeys(): Promise<string[]> {
  const profile = await getProfile();
  if (!profile) return [];
  const grants = await getModuleGrants(profile.id);
  const ctx = { role: profile.role, isOwner: isOwnerEmail(profile.email) };
  return MODULES.filter(
    (m) => m.inNav && canAccessModule(ctx, grants, m.key),
  ).map((m) => m.key);
}

/**
 * Page/layout guard: the signed-in user must have the given module granted.
 * Redirects to /login when signed out, or /dashboard (always-on) when the
 * module isn't granted — never leaks a 404 vs 403 distinction.
 */
export async function requireModule(moduleKey: string) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!(await hasModule(profile, moduleKey))) redirect("/dashboard");
  return profile;
}

export type ApiGate =
  | { profile: Profile; error?: undefined }
  | { profile?: undefined; error: NextResponse };

/**
 * API guard: returns the profile when the caller may use `moduleKey` (and,
 * optionally, holds `capability`), else a 401/403 NextResponse to return
 * directly. Use at the top of a route handler:
 *
 *   const gate = await guardModuleApi("payables", "act");
 *   if (gate.error) return gate.error;
 *   const { profile } = gate;
 */
export async function guardModuleApi(
  moduleKey: string,
  capability?: Capability,
): Promise<ApiGate> {
  const profile = await getProfile();
  if (!profile) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!(await hasModule(profile, moduleKey))) {
    return {
      error: NextResponse.json(
        { error: "forbidden: module not granted" },
        { status: 403 },
      ),
    };
  }
  if (capability && !can(profile.role, capability)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { profile };
}
