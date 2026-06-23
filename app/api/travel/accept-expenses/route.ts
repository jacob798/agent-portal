import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Travel "Accept": confirm a trip's staged travel expenses are correct (right trip, traveler,
 * amount). Flips status 'staged' → 'accepted' for the trip's travel rows. Posting itself happens
 * in Payables (the QB posting authority) — accepted rows surface there for coding + posting.
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
  let body: { tripId?: string; ids?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const tripId = (body.tripId ?? "").trim();
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!tripId && !ids.length) return NextResponse.json({ error: "tripId or ids required" }, { status: 400 });

  const admin = createAdminClient();
  // only staged travel rows become accepted — never touch already-posted or non-travel rows
  let q = admin.from("payables_queue").update({ status: "accepted" }).eq("status", "staged");
  q = ids.length ? q.in("id", ids) : q.eq("trip_id", tripId);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, accepted: (data ?? []).length });
}
