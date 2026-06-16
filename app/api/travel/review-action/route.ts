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

  const admin = createAdminClient();
  let changed = 0;
  for (const it of items) {
    const conf = (it.conf ?? "").trim();
    if (!conf) continue;
    // match this confirmation's travel row(s) on the trip; traveler narrows it when split
    let q = admin.from("payables_queue").update(
      action === "reassign"
        ? { trip_id: (body.newTripId ?? "").trim() }
        : { status: STATUS[action] },
    ).eq("trip_id", tripId).eq("extracted->>conf", conf);
    if ((it.traveler ?? "").trim()) q = q.eq("extracted->>traveler", (it.traveler ?? "").trim());
    const { data, error } = await q.select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changed += (data ?? []).length;
  }
  return NextResponse.json({ ok: true, action, changed });
}
