// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import Placeholder from "@/components/Placeholder";
import ValuationFrame from "@/components/valuation/ValuationFrame";
import { requireCapability } from "@/lib/auth/guard";
import { mintValuationToken, valuationBaseUrl } from "@/lib/valuation/portalToken";

/**
 * Valuation module — the deployed valuation service, embedded in the portal.
 *
 * We're already signed in (Microsoft SSO), so we mint a short-lived signed token
 * from this profile and load the valuation app's /portal-enter handshake inside
 * an iframe; it verifies the token and sets its own session cookie. No second
 * login, and it stays inside the portal — we never open a separate tab.
 *
 * Embedding requires the valuation app to be the *same site* as the portal
 * (e.g. valuation.foundry-capital.co): browsers (Safari ITP) block an iframe's
 * cross-site session cookie. Until VALUATION_URL points at that same-site
 * subdomain, we show a "connecting" notice rather than a broken frame.
 */

/** registrable-ish domain: last two labels (good enough for *.foundry-capital.co). */
function parentDomain(host: string): string {
  const labels = host.split(":")[0].split(".");
  return labels.slice(-2).join(".");
}

export default async function ValuationPage() {
  const profile = await requireCapability("read");
  const base = valuationBaseUrl();
  const secret = process.env.PORTAL_SHARED_SECRET;

  if (!base || !secret) {
    return (
      <Placeholder
        title="Valuation"
        note="Set VALUATION_URL and PORTAL_SHARED_SECRET to connect the valuation service."
      />
    );
  }

  const portalHost = (await headers()).get("host") ?? "";
  const valuationHost = new URL(base).host;
  const sameSite =
    !!portalHost &&
    (valuationHost === parentDomain(portalHost) ||
      valuationHost.endsWith(`.${parentDomain(portalHost)}`));

  if (!sameSite) {
    // Cross-site: an embedded session cookie would be blocked. Surface a clear
    // status instead of a frame that falls back to a password prompt. This
    // resolves itself once VALUATION_URL is the same-site subdomain.
    return (
      <Placeholder
        title="Valuation"
        note={`Finishing setup: the valuation service must run on a portal subdomain
          (e.g. valuation.foundry-capital.co) to embed securely. It will appear
          here automatically once DNS is connected.`}
      />
    );
  }

  const token = mintValuationToken(profile);
  return (
    <ValuationFrame src={`${base}/portal-enter?t=${encodeURIComponent(token)}`} />
  );
}
