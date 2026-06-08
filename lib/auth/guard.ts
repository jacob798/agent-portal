import "server-only";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/profile";
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
