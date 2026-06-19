import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Operator portal = live data. Don't let the client Router Cache serve a stale segment when you
  // navigate between screens, so a change made on one screen is reflected the moment you land on the
  // next one (paired with force-dynamic pages + router.refresh() after a mutation). (Jacob, 2026-06-19.)
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
