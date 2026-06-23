import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * "Not travel": detach a mis-attributed expense from its trip and send it back to Payables review
 * (e.g. a home dinner that got attributed to a trip). REVERSIBLE — the row reappears in Payables as
 * its real merchant, it is NOT deleted. The trip-header rollup vendor is replaced by the actual
 * merchant (payee). Never touches posted/accepted rows (those are committed).
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
  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: e1 } = await admin
    .from("payables_queue").select("id, status, vendor_display, extracted").eq("id", id).single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (["posted", "accepted"].includes(String(row?.status))) {
    return NextResponse.json({ error: `can't detach a ${row?.status} expense` }, { status: 409 });
  }
  const ex = (row?.extracted ?? {}) as { payee?: string };
  const merchant = row?.vendor_display || ex.payee || "Unknown vendor";
  const { error: e2 } = await admin
    .from("payables_queue").update({ trip_id: null, status: "open", vendor: merchant }).eq("id", id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, vendor: merchant });
}
