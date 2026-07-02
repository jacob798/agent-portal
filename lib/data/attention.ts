import "server-only";
import { getPayablesQueue } from "./payables";
import { getIngestExceptions } from "./ingestExceptions";
import { getNeedsTrip } from "./travel";
import { getAgents } from "./agents";

// Per-module "needs attention" counts for the Home launcher, derived from the SAME reads
// each module uses — so a badge always matches what the operator finds inside. Only modules
// with a natural pending metric appear here; everything else shows no badge (never a
// fabricated number). Each counter is isolated: a failure yields no badge, never an error.
type Counter = () => Promise<number>;

const COUNTERS: Record<string, Counter> = {
  // payables coding queue — rows still being coded (open); reclassified/accepted are resolved.
  payables: async () =>
    (await getPayablesQueue()).filter((r) => (r.status ?? "open") === "open").length,
  // front-door routing/parse problems awaiting a decision.
  "ingest-exceptions": async () => (await getIngestExceptions()).counts.total,
  // confirmations that couldn't be matched to a trip.
  travel: async () => (await getNeedsTrip()).length,
  // agents currently degraded or down.
  monitoring: async () =>
    (await getAgents()).filter((a) => a.status === "degraded" || a.status === "down").length,
};

/** Attention counts for the modules the user can access. Only positive counts are returned;
 *  runs the counters in parallel and only for accessible modules. */
export async function getAttentionCounts(
  accessible: ReadonlySet<string>,
): Promise<Record<string, number>> {
  const keys = Object.keys(COUNTERS).filter((k) => accessible.has(k));
  const out: Record<string, number> = {};
  await Promise.all(
    keys.map(async (k) => {
      try {
        const n = await COUNTERS[k]();
        if (n > 0) out[k] = n;
      } catch {
        // a failing count must never break the launcher
      }
    }),
  );
  return out;
}
