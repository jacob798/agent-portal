import type { Trip } from "./travel";

/**
 * Canonical QuickBooks trip-rollup vendor — ports build_trip_header_subject:
 *   "Travel YYYY-MM - ENTITY Purpose Destination (M/D–M/D)"
 * Every trip charge posts under this one vendor; the merchant is a memo line.
 *
 * Client-safe (type-only Trip import) so it can be used in the client component
 * without dragging the server Supabase module into the browser bundle.
 */
export function tripVendor(t: Pick<Trip, "ent" | "purpose" | "dest" | "start" | "end">): string {
  const month = t.start ? t.start.slice(0, 7) : "";
  const md = (iso: string) => {
    if (!iso) return "";
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  const label = [t.ent, t.purpose, t.dest].filter(Boolean).join(" ").trim() || "Trip";
  const s = md(t.start);
  const e = md(t.end);
  const suffix = s && e ? ` (${s}–${e})` : s ? ` (${s})` : "";
  return `${month ? `Travel ${month}` : "Travel"} - ${label}${suffix}`;
}
