import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Approve a batch of payables rows in one shot — the QuickBooks batch checkpoint.
 * Each row keeps its already-confirmed coding; we just set status='approved'
 * (staged for the backend QBO post_runner). Returns how many were staged.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x.trim());
  if (!ids.length) return NextResponse.json({ error: "no ids provided" }, { status: 400 });

  const admin = createAdminClient();
  // SERVER-SIDE READINESS GUARD (defense in depth — the UI also gates). A row only posts when it's
  // fully populated: entity + a coded account (GL non-BC / Paylocity BC) + pay-from + doc-type
  // identified + canonical vendor == the real merchant (non-travel). A missing document is a tracked
  // gap, not a blocker.
  const { data: rowsToCheck } = await admin
    .from("payables_queue")
    .select("id, entity, gl, bc_category, account, doc_type, trip_id, vendor, vendor_display, invoice_number")
    .in("id", ids);
  const incomplete: string[] = [];
  for (const r of rowsToCheck ?? []) {
    const acct = String(r.account ?? "");
    const m: string[] = [];
    if (!r.entity) m.push("entity");
    if (r.entity === "BC" ? !r.bc_category : !(r.gl && String(r.gl).trim())) m.push("account");
    if (!acct || /pick account|pick a card|pay-?from/i.test(acct)) m.push("pay-from");
    if (!r.doc_type || /identify|unknown/i.test(String(r.doc_type))) m.push("doc-type");
    if (r.trip_id && !r.invoice_number) m.push("ticket #");
    if (!r.trip_id && r.vendor && r.vendor_display &&
        String(r.vendor).toLowerCase().trim() !== String(r.vendor_display).toLowerCase().trim()) m.push("vendor mismatch");
    if (m.length) incomplete.push(r.id);
  }
  if (incomplete.length) {
    return NextResponse.json(
      { error: `Not ready to post — ${incomplete.length} row(s) are incomplete. Fill entity, account, pay-from, and doc-type first.`, incomplete },
      { status: 422 },
    );
  }

  const { data, error } = await admin
    .from("payables_queue")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, staged: data?.length ?? 0 });
}
