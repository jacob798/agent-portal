import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * The Travel review surface acts on CONFIRMATIONS (not dollar invoices). One call handles a whole
 * leg (all co-travelers) or, after Split, specific confirmations. The durable state lives on the
 * expense row (payables_queue) so a worker rebuild of trips.confirmations never resets the decision:
 *
 *   accept_invoice       — no future invoice; this confirmation IS the expense → route to Payables
 *                          (status 'staged' → 'accepted'; Payables lists accepted rows).
 *   accept_confirmation  — an invoice is forthcoming → hold it; don't route. status → 'awaiting_invoice'
 *                          (Payables excludes it; the real invoice matches by confirmation later).
 *   reassign             — wrong trip → move the rows to newTripId.
 *   decline              — remove from the program (soft): status → 'declined'.
 *
 * Targets the trip's travel rows by (trip_id, confirmation, traveler). A confirmation with no
 * expense yet (e.g. a hotel booking with no financials) simply has nothing to update — that's fine.
 */
type Item = { conf?: string; traveler?: string };

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { action?: string; tripId?: string; items?: Item[]; newTripId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const action = (body.action ?? "").trim();
  const tripId = (body.tripId ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!tripId || !items.length) return NextResponse.json({ error: "tripId + items required" }, { status: 400 });

  const STATUS: Record<string, string> = {
    accept_invoice: "accepted", accept_confirmation: "awaiting_invoice", decline: "declined",
  };
  if (action !== "reassign" && !STATUS[action]) {
    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  }
  if (action === "reassign" && !(body.newTripId ?? "").trim()) {
    return NextResponse.json({ error: "reassign needs newTripId" }, { status: 400 });
  }

  // The displayed status on trips.confirmations (worker-derived) → set it here too so the
  // decision shows IMMEDIATELY on refresh and survives, instead of waiting for a worker rebuild.
  const CONF_STATUS: Record<string, string> = {
    accept_invoice: "accepted_invoice", accept_confirmation: "accepted_confirmation", decline: "declined",
  };
  const admin = createAdminClient();
  const newTripId = (body.newTripId ?? "").trim();
  const wanted = new Set(items.map((it) => `${(it.conf ?? "").trim().toUpperCase()}|${(it.traveler ?? "").trim().toUpperCase()}`));
  const matchItem = (conf: string, traveler: string) => {
    const cu = (conf ?? "").toUpperCase(); const tu = (traveler ?? "").toUpperCase();
    // an item with no traveler matches the whole leg (any traveler); with traveler, exact
    return wanted.has(`${cu}|${tu}`) || wanted.has(`${cu}|`);
  };

  // 1) Update the durable expense rows (payables_queue), when one exists for the conf.
  let changed = 0;
  for (const it of items) {
    const conf = (it.conf ?? "").trim();
    if (!conf) continue;
    // Case-insensitive match: the staged travel rows store traveler UPPERCASE ("JESSICA DAVIDSON")
    // while the review surface sends title-case ("Jessica Davidson") — a case-sensitive eq matched
    // nothing, so accepted rows never left 'staged' and never appeared in the Payables queue.
    let q = admin.from("payables_queue").update(
      action === "reassign" ? { trip_id: newTripId } : { status: STATUS[action] },
    ).eq("trip_id", tripId).ilike("extracted->>conf", conf)
      // NEVER touch an already-posted row — a posted invoice is done; re-accepting/declining/moving
      // it from the review surface could regress its status or risk duplicating it in QB.
      .neq("status", "posted");
    if ((it.traveler ?? "").trim()) q = q.ilike("extracted->>traveler", (it.traveler ?? "").trim());
    const { data, error } = await q.select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changed += (data ?? []).length;
  }

  // 2) Update trips.confirmations jsonb so the review list reflects the decision now (the
  //    confirmation may have NO expense yet — this is the only place the decision is recorded then).
  let confsUpdated = 0;
  try {
    const { data: trip } = await admin.from("trips").select("confirmations").eq("id", tripId).maybeSingle();
    const groups = Array.isArray(trip?.confirmations) ? (trip!.confirmations as Array<{ confs?: Array<{ conf?: string; traveler?: string; status?: string }> }>) : [];
    if (groups.length) {
      for (const g of groups) {
        const confs = Array.isArray(g.confs) ? g.confs : [];
        if (action === "reassign") {
          // drop the matched confs from this trip's review list (they moved) — but never move a
          // posted leg.
          g.confs = confs.filter((c) => { const hit = matchItem(c.conf ?? "", c.traveler ?? "") && c.status !== "posted"; if (hit) confsUpdated++; return !hit; });
        } else {
          for (const c of confs) {
            // never overwrite a posted leg's status from the review surface.
            if (c.status !== "posted" && matchItem(c.conf ?? "", c.traveler ?? "")) { c.status = CONF_STATUS[action]; confsUpdated++; }
          }
        }
      }
      // prune any groups left with no confs after a reassign
      const pruned = groups.filter((g) => (g.confs?.length ?? 0) > 0);
      await admin.from("trips").update({ confirmations: pruned }).eq("id", tripId);
    }
  } catch {
    /* jsonb update is best-effort — the payables update above is the source of truth */
  }

  // 3) On DECLINE, also drop the confirmation from the trip SCHEDULE (itinerary) immediately, so a
  //    discarded car/hotel/flight disappears on refresh without waiting for a worker rebuild. (The
  //    worker's _rebuild_itin also honors the declined status, so it never re-adds it.)
  if (action === "decline") {
    try {
      const confSet = new Set(items.map((it) => (it.conf ?? "").trim().toUpperCase()).filter(Boolean));
      if (confSet.size) {
        const { data: t2 } = await admin.from("trips").select("itin").eq("id", tripId).maybeSingle();
        const itin = Array.isArray(t2?.itin) ? (t2!.itin as Array<{ conf?: string }>) : [];
        const kept = itin.filter((r) => !confSet.has((r.conf ?? "").trim().toUpperCase()));
        if (kept.length !== itin.length) await admin.from("trips").update({ itin: kept }).eq("id", tripId);
      }
    } catch {
      /* best-effort — the worker rebuild also drops declined confs */
    }
  }

  return NextResponse.json({ ok: true, action, changed, confsUpdated });
}
