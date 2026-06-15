import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Resolve or dismiss a "needs a trip" ask item (public.travel_needs_trip).
 * status='resolved' when the operator created/assigned a trip from it; 'dismissed' when
 * it isn't a trip. Trips are never auto-created — this only clears the ask.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  let body: { id?: string; status?: string; tripId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const tripId = (body.tripId ?? "").trim();
  // assigning to an existing trip resolves the ask AND records WHICH trip, so the worker drain
  // populates that trip's itinerary + stages any prepaid items (it re-runs while loc_learned=false).
  const status = tripId || body.status === "resolved" ? "resolved" : "dismissed";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const update: Record<string, unknown> = { status };
  if (tripId) {
    update.assigned_trip_id = tripId;
    update.loc_learned = false;
  }
  const { error } = await admin.from("travel_needs_trip").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, status, tripId: tripId || null });
}
