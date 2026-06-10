import "server-only";
import crypto from "node:crypto";
import type { Profile } from "@/lib/auth/profile";

/**
 * Mint the short-lived entry token the valuation app trusts (SSO handshake).
 *
 * The valuation service verifies this with the same PORTAL_SHARED_SECRET
 * (agents/valuation/core/portal_auth.py). The wire format MUST stay byte-for-byte
 * compatible with that verifier:
 *   raw = base64url( json.dumps(payload, sort_keys=True, separators=(",",":")) )
 *   sig = hex( hmac_sha256(secret, raw) )
 *   token = `${raw}.${sig}`
 * It then exchanges the token for its own 8h session cookie, so this TTL only has
 * to cover the redirect — keep it short.
 */
export function mintValuationToken(profile: Profile, ttlSeconds = 120): string {
  const secret = process.env.PORTAL_SHARED_SECRET ?? "";
  if (!secret) throw new Error("PORTAL_SHARED_SECRET is not set");

  // Keys must be emitted in sorted order to match Python's sort_keys=True.
  const payload = {
    email: profile.email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    name: profile.displayName,
    role: profile.role,
  };
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return `${raw}.${sig}`;
}

/** Base URL of the deployed valuation service (Azure Container App FQDN). */
export function valuationBaseUrl(): string {
  return (process.env.VALUATION_URL ?? "").replace(/\/+$/, "");
}
