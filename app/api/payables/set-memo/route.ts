import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Persist an operator edit to a row's QBO memo. The memo is computed at ingest and
 * shown in the queue/drawer; this lets the operator override it before posting. The
 * post_runner uses the stored value as-is.
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

  let body: { id?: string; memo?: string; vendor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const memo = typeof body.memo === "string" ? body.memo : "";
  const vendor = (body.vendor ?? "").trim();

  const admin = createAdminClient();
  // Fetch the edited row's invoice values so the backend can deterministically swap
  // them for the next invoice's values (template learning, no LLM).
  const { data: rowData } = await admin
    .from("payables_queue")
    .select("invoice_number, extracted, vendor_contact, sub")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("payables_queue").update({ memo }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Learn the FORMAT for this vendor: store the literal edited memo + the field values
  // of THIS invoice; the backend reproduces the format by swapping old→new values on
  // the next invoice from this vendor.
  if (vendor && memo.trim()) {
    const ex = (rowData?.extracted ?? {}) as Record<string, unknown>;
    const vc = (rowData?.vendor_contact ?? {}) as Record<string, unknown>;
    const dateMatch = String(rowData?.sub ?? "").match(/\d{4}-\d{2}-\d{2}/);
    const sample: Record<string, string> = {};
    const put = (k: string, v: unknown) => {
      if (v !== null && v !== undefined && String(v).trim()) sample[k] = String(v);
    };
    put("service_period", ex.service_period);
    put("invoice_number", rowData?.invoice_number);
    put("account_number", vc.account_number);
    put("date", dateMatch ? dateMatch[0] : "");
    put("line_count", ex.line_count);
    put("usage", ex.usage);
    put("payee", ex.payee ?? vendor);

    await admin.from("vendor_memo_formats").upsert(
      { vendor, memo_format: memo, sample_values: sample, updated_at: new Date().toISOString() },
      { onConflict: "vendor" },
    );
  }

  return NextResponse.json({ ok: true });
}
