import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Approve a batch of payables rows in one shot — the QuickBooks batch checkpoint.
 * Each row keeps its already-confirmed coding; we just set status='approved'
 * (staged for the backend QBO post_runner). Returns how many were staged.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("payables");
  if (_gate.error) return _gate.error;
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
    .select("id, entity, gl, bc_category, account, doc_type, trip_id, vendor, vendor_display, invoice_number, payment_method_id, posting")
    .in("id", ids);
  // Per-row detail so the operator sees WHICH row and WHICH field — not a generic banner (bug 8c).
  const incompleteDetail: { id: string; vendor: string; missing: string[] }[] = [];
  for (const r of rowsToCheck ?? []) {
    const acct = String(r.account ?? "");
    const m: string[] = [];
    if (!r.entity) m.push("entity");
    if (r.entity === "BC" ? !r.bc_category : !(r.gl && String(r.gl).trim())) m.push("account");
    // Pay-from ⟺ posting type: a Bill has NO payment method; an Expense must have a real pay-from.
    if (String(r.posting) === "bill") {
      if (r.payment_method_id) m.push("bill has a payment method");
    } else if (!acct || /pick account|pick a card|pay-?from|^unpaid/i.test(acct)) {
      m.push("pay-from");
    }
    if (!r.doc_type || /identify|unknown/i.test(String(r.doc_type))) m.push("doc-type");
    if (r.trip_id && !r.invoice_number) m.push("ticket #");
    if (!r.trip_id && r.vendor && r.vendor_display &&
        String(r.vendor).toLowerCase().trim() !== String(r.vendor_display).toLowerCase().trim()) m.push("vendor mismatch");
    if (m.length) incompleteDetail.push({ id: r.id, vendor: String(r.vendor_display || r.vendor || r.id), missing: m });
  }
  if (incompleteDetail.length) {
    const lines = incompleteDetail.map((d) => `${d.vendor}: ${d.missing.join(", ")}`);
    return NextResponse.json(
      {
        error: `Not ready to post — fix ${incompleteDetail.length} row(s): ${lines.join(" · ")}`,
        incomplete: incompleteDetail.map((d) => d.id), // ids (back-compat for callers that select/scroll)
        incompleteDetail, // [{id, vendor, missing[]}] — the UI highlights the row + names the field
      },
      { status: 422 },
    );
  }

  const { data, error } = await admin
    .from("payables_queue")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // LEARN THE OPERATOR'S CODING (the commit IS the label). For each approved NON-TRAVEL row, save
  // the coding back onto the vendor (vendor_rules) so the NEXT invoice from that vendor arrives
  // fully coded instead of blank — entity + GL auto-apply on ingest, and pay-from now too. Keyed by
  // vendor (upsert). Best-effort: a learning failure must never fail the approve.
  try {
    const seen = new Set<string>();
    const learn = (rowsToCheck ?? [])
      .filter((r) => !r.trip_id && r.vendor && r.entity)
      .map((r) => ({
        vendor: String(r.vendor),
        entity_code: r.entity as string,
        // BC routes deterministically to the loan account by entity, so don't pin a GL there.
        gl_full_name: r.entity === "BC" ? null : (r.gl ? String(r.gl) : null),
        pay_method_id: r.payment_method_id ? String(r.payment_method_id) : null,
        source: "approved",
        updated_at: new Date().toISOString(),
      }))
      .filter((v) => { const k = v.vendor.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (learn.length) await admin.from("vendor_rules").upsert(learn, { onConflict: "vendor" });
  } catch {
    /* learning is best-effort — never block the approve */
  }

  return NextResponse.json({ ok: true, staged: data?.length ?? 0 });
}
