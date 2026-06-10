import Placeholder from "@/components/Placeholder";
import { requireCapability } from "@/lib/auth/guard";
import { mintValuationToken, valuationBaseUrl } from "@/lib/valuation/portalToken";

/**
 * Valuation module — embeds the deployed valuation service via SSO.
 *
 * We're already signed in to the portal (Microsoft SSO). The portal mints a
 * short-lived signed token from this profile and opens the valuation app's
 * /portal-enter handshake, which sets its own session cookie and lands on the
 * queue. No second login.
 *
 * Until VALUATION_URL + PORTAL_SHARED_SECRET are configured, we show the
 * placeholder so the route still renders in mock / unconfigured environments.
 */
export default async function ValuationPage() {
  const profile = await requireCapability("read");
  const base = valuationBaseUrl();
  const secret = process.env.PORTAL_SHARED_SECRET;

  if (!base || !secret) {
    return (
      <Placeholder
        title="Valuation"
        note="Set VALUATION_URL and PORTAL_SHARED_SECRET to embed the valuation service."
      />
    );
  }

  const token = mintValuationToken(profile);
  const src = `${base}/portal-enter?t=${encodeURIComponent(token)}`;

  return (
    <iframe
      src={src}
      title="Valuation"
      className="block h-[calc(100vh-4rem)] w-full border-0"
    />
  );
}
