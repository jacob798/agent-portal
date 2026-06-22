import crypto from "crypto";

/**
 * Server-to-server call to the agent-system worker's travel API (the Python builder the portal
 * can't run itself — itin/confirmations are computed there). Signs the request with HMAC-SHA256
 * over `"{ts}.{body}"` using PORTAL_SHARED_SECRET (the same shared secret as the valuation SSO).
 *
 * Gracefully no-ops (returns skipped) when WORKER_API_URL or PORTAL_SHARED_SECRET is unset, so the
 * portal deploys safely before the worker endpoint/ingress is live — callers fall back to their
 * existing optimistic DB updates and the change reconciles on the next worker cycle.
 */
export async function callWorker(
  path: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  // The worker URL is the public Container App FQDN (not a secret), so default it here — the portal
  // then needs only PORTAL_SHARED_SECRET (already set for the valuation SSO). WORKER_API_URL env
  // still overrides if the worker is ever moved/recreated.
  const base = process.env.WORKER_API_URL
    || "https://agent-system-worker.calmmushroom-39c3f2c1.westus.azurecontainerapps.io";
  const secret = process.env.PORTAL_SHARED_SECRET;
  if (!base || !secret) {
    return { ok: false, status: 0, body: { skipped: "PORTAL_SHARED_SECRET not set" } };
  }
  const ts = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Timestamp": ts, "X-Signature": sig },
      body,
      // a rebuild is ~tens of ms but be generous; never hang the request handler
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body: j };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String(e) } };
  }
}
