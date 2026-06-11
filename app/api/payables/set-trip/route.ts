import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Re-attribute a charge to a trip (or clear it). Picking a trip sets the row's vendor to
 * the trip's CANONICAL header (read from `payables_trips.header` — the locked Python
 * source, never recomputed here), the trip's entity, the trip_id, and stamps each line's
 * entity; a BC trip routes the GL to Loan - Builders Capital. Choosing "Not a trip"
 * clears the attribution and restores the real merchant (extracted.payee) as the vendor.
 * The Dropbox file re-files to the corrected name at post time (post_runner).
 */
const BC_GL = "Loan - Builders Capital";

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { id?: string; tripId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const tripId = (body.tripId ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("payables_queue")
    .select("lines, extracted")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const update: Record<string, unknown> = {};

  if (!tripId) {
    // clear attribution → back to a normal payable under the real merchant
    const payee = (row.extracted as { payee?: string } | null)?.payee;
    if (payee) update.vendor = payee;
    update.trip_id = null;
  } else {
    const { data: trip } = await admin
      .from("payables_trips")
      .select("header, entity")
      .eq("trip_id", tripId)
      .single();
    if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
    const entity = (trip.entity ?? null) as string | null;
    update.vendor = trip.header;
    update.trip_id = tripId;
    if (entity) {
      update.entity = entity;
      update.recommended = entity;
      update.exception = null;
      update.reason = null;
      for (const ln of lines) ln.entity = entity;
      if (entity === "BC") {
        update.gl = BC_GL;
        for (const ln of lines) ln.gl = BC_GL;
      }
    }
    update.lines = lines;
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, tripId: tripId || null });
}
