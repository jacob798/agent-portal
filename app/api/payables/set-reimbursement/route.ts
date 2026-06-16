import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Operator override of the BC reimbursement amount (the GROSS ticket price claimed from BC via
 * the exported travel report) — for when extraction couldn't see the fare behind a credit. The
 * QuickBooks posting amount (`amount`, net) is untouched.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  let body: { id?: string; amount?: number | string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const amount = Number(body.amount);
  if (!id || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "id and a non-negative amount required" }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("payables_queue").update({ reimbursement_amount: amount }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, reimbursementAmount: amount });
}
