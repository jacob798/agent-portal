import { createClient } from "@/lib/supabase/server";

// Uses the portal's existing Microsoft/Supabase cookies. No demo identity,
// email allowlist, module-role inheritance, service-role bearer or new cookie.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ accountId: string; path: string[] }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIMIT = 1048576;
function failure(status: number, code: string) {
  return Response.json({ errors: [{ code }] }, { status, headers: { "Cache-Control": "no-store" } });
}
async function forward(request: Request, context: Context) {
  const { accountId, path } = await context.params;
  if (!UUID.test(accountId) || !path.length || path.some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === "." || p === ".."))
    return failure(404, "not_found");
  const configured = process.env.DEALS_WORKSPACE_URL;
  const portalOrigin = process.env.DEALS_PORTAL_ORIGIN;
  if (!configured || !portalOrigin) return failure(503, "workspace_not_configured");
  let upstream: URL;
  try {
    upstream = new URL(configured);
    const portal = new URL(portalOrigin);
    if (upstream.protocol !== "https:" || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash ||
        portal.protocol !== "https:" || portal.origin !== portalOrigin) return failure(503, "workspace_not_configured");
  } catch { return failure(503, "workspace_not_configured"); }
  if (request.method === "POST") {
    // Browser cookie mutations require the configured same origin. Cross-origin
    // forms, opaque origins and origin-less requests cannot use this bridge.
    if (request.headers.get("origin") !== portalOrigin ||
        ![null, "same-origin"].includes(request.headers.get("sec-fetch-site"))) return failure(403, "forbidden_origin");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return failure(415, "invalid_content_type");
  }
  try {
    const supabase = await createClient();
    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data.user) return failure(401, "unauthenticated");
    const session = await supabase.auth.getSession();
    if (session.error || !session.data.session || session.data.session.user.id !== verified.data.user.id)
      return failure(401, "unauthenticated");
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      if (!reader) return failure(400, "missing_body");
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > LIMIT) { await reader.cancel(); return failure(413, "request_too_large"); }
        chunks.push(part.value);
      }
      body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    upstream.pathname = "/" + path.join("/");
    upstream.search = new URL(request.url).search;
    const response = await fetch(upstream, {
      method: request.method, body: body as BodyInit | undefined, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: "Bearer " + session.data.session.access_token,
        "X-Deals-Account": accountId, "X-Deals-Mount": "/deals/" + accountId,
        "Content-Type": "application/json" },
    });
    const headers = new Headers();
    for (const name of ["content-type", "content-security-policy", "x-content-type-options", "referrer-policy"])
      if (response.headers.has(name)) headers.set(name, response.headers.get(name)!);
    headers.set("Cache-Control", "no-store");
    // Never forward upstream cookies, credentials, redirects or arbitrary headers.
    return new Response(response.body, { status: response.status, headers });
  } catch { return failure(503, "workspace_unavailable"); }
}
export const GET = forward;
export const POST = forward;
