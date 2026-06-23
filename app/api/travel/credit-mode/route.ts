import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Set an eCredit's reimbursement MODE — the operator's "as paid vs as used" decision. The credit
 * lives in the SOURCE trip's `credits` jsonb; flip `reimbursed_origin` on the matching entry.
 *   true  = "as paid"  — already reimbursed at the cancelled trip → draws down on use.
 *   false = "as used"  — reimbursed each time it pays a trip → no drawdown.
 * The flag is independent of the balance, so flipping it never changes amounts.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("travel");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  let body: { tripId?: string; creditNumber?: string; reimbursedOrigin?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const tripId = (body.tripId ?? "").trim();
  const creditNumber = (body.creditNumber ?? "").trim();
  if (!tripId || !creditNumber) return NextResponse.json({ error: "tripId and creditNumber required" }, { status: 400 });
  const reimbursedOrigin = !!body.reimbursedOrigin;

  const admin = createAdminClient();
  const { data: trip, error: e1 } = await admin.from("trips").select("credits").eq("id", tripId).single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const credits = Array.isArray(trip?.credits) ? (trip.credits as Record<string, unknown>[]) : [];
  let found = false;
  const next = credits.map((c) => {
    if (c.credit_number === creditNumber) { found = true; return { ...c, reimbursed_origin: reimbursedOrigin }; }
    return c;
  });
  if (!found) return NextResponse.json({ error: "credit not found on trip" }, { status: 404 });
  const { error: e2 } = await admin.from("trips").update({ credits: next }).eq("id", tripId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
