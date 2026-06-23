import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isRole } from "@/lib/auth/roles";
import { isOwnerEmail } from "@/lib/auth/owner";
import {
  moduleForPath,
  canAccessModule,
  isApiPath,
} from "@/lib/auth/modules";

/**
 * Refreshes the Supabase session on every request and gates access:
 *  - unauthenticated users are redirected to /login (except /login, /auth/*),
 *  - authenticated users hitting a module they lack are redirected to
 *    /dashboard (pages) or get a 403 (API). This is the AUTHORITATIVE module
 *    gate — it sits in front of every page and every /api/** route, so a route
 *    can never be forgotten. Page guards + API guards add defense in depth.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not provisioned yet: let every request through so the app still runs.
  // Auth gating activates automatically once these env vars are set.
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser() —
  // it can cause hard-to-debug session-refresh issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Per-user module gate. Only for signed-in users on a path a module owns.
  if (user) {
    const moduleKey = moduleForPath(pathname);
    if (moduleKey) {
      const [{ data: prof }, { data: grantRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).single(),
        supabase
          .from("profile_modules")
          .select("module_key")
          .eq("profile_id", user.id),
      ]);
      const role = isRole(prof?.role) ? prof.role : "viewer";
      const granted = new Set(
        (grantRows ?? []).map((r) => r.module_key as string),
      );
      const ok = canAccessModule(
        { role, isOwner: isOwnerEmail(user.email) },
        granted,
        moduleKey,
      );
      if (!ok) {
        if (isApiPath(pathname)) {
          return NextResponse.json(
            { error: "forbidden: module not granted" },
            { status: 403 },
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return supabaseResponse;
}
