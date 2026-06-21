import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Re-attribute a charge to a trip (or clear it). Picking a trip sets the row's vendor to
 * the trip's CANONICAL header (read from `payables_trips.header` — the locked Python
 * source, never recomputed here), the trip's entity, the trip_id, and stamps each line's
 * entity. It ALSO RECODES the account for the NEW entity by doc-type — BC → Loan-Builders
 * Capital + a Paylocity category; PER/FC → the 'Travel <X>' GL leaf. Without this recode a
 * row moved from a BC trip to a PER trip kept BC's locked "Loan - Builders Capital" GL and
 * couldn't be fixed (the travel GL is locked in the UI). Choosing "Not a trip" clears the
 * attribution and restores the real merchant (extracted.payee) as the vendor. The Dropbox
 * file re-files to the corrected name at post time (post_runner).
 */
const BC_GL = "Loan - Builders Capital";

// doc-type → the PER/FC 'Travel <X>' GL leaf (mirrors the worker's _travel_leaf_for_doctype).
function travelLeaf(docType: string | null): string {
  const d = (docType ?? "").toLowerCase();
  if (["hotel", "airbnb", "lodging", "accommodation", "stay"].includes(d)) return "Travel Lodging";
  if (["meal", "meals", "dining", "food"].includes(d)) return "Travel Food";
  if (["entertainment", "event"].includes(d)) return "Travel Entertainment";
  return "Travel Transportation"; // flight/train/car/ride/parking → transportation
}

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
    .select("lines, extracted, doc_type")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const docType = (row.doc_type as string | null) ?? (row.extracted as { booking_type?: string } | null)?.booking_type ?? null;
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
        // BC → balance-sheet loan + a Paylocity category by doc-type; clear any stale PER/FC GL.
        const bcCat = ["meal", "meals", "dining", "food"].includes((docType ?? "").toLowerCase())
          ? "Meals - General" : "Travel : General";
        update.gl = BC_GL;
        update.bc_category = bcCat;
        for (const ln of lines) { ln.gl = BC_GL; ln.bcCategory = bcCat; }
      } else if (entity === "PER" || entity === "FC") {
        // PER/FC → the entity's 'Travel <X>' GL leaf, resolved to the full account name; clear any
        // stale BC category. Without this the old BC "Loan - Builders Capital" GL stuck (and locked).
        const leaf = travelLeaf(docType);
        const { data: gla } = await admin
          .from("gl_accounts")
          .select("account_full_name")
          .eq("entity_code", entity)
          .eq("account_name", leaf)
          .limit(1);
        const glFull = (gla?.[0]?.account_full_name as string | undefined) ?? null;
        update.bc_category = null;
        if (glFull) {
          update.gl = glFull;
          for (const ln of lines) ln.gl = glFull;
        }
      }
    }
    update.lines = lines;
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, tripId: tripId || null });
}
