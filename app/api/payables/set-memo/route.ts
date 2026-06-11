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
  const { error } = await admin.from("payables_queue").update({ memo }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Learn the FORMAT for this vendor: next ingest of one of their invoices reproduces
  // this style with the new invoice's data (handled by the backend reformat step).
  if (vendor && memo.trim()) {
    await admin
      .from("vendor_memo_formats")
      .upsert({ vendor, memo_format: memo, updated_at: new Date().toISOString() }, { onConflict: "vendor" });
  }

  return NextResponse.json({ ok: true });
}
