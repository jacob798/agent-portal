import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Approve a payables row: persist the operator's confirmed coding (entity,
 * pay-from account, per-line entity/GL, BC category) and mark it
 * status='approved' — staged for the QuickBooks batch post. The backend
 * post_runner flips it to 'posted' once written to QBO.
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

  let body: {
    id?: string;
    entity?: string | null;
    account?: string | null;
    paymentMethodId?: string | null;
    gl?: string | null;
    bcCategory?: string | null;
    lines?: { desc: string; amount: number; gl: string; entity?: string; bcCategory?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = {
    status: "approved",
    approved_at: new Date().toISOString(),
    auto: true,
    exception: null,
    reason: null,
  };
  if (body.entity !== undefined) update.entity = body.entity;
  if (body.account !== undefined) update.account = body.account;
  if (body.paymentMethodId !== undefined) update.payment_method_id = body.paymentMethodId;
  if (body.gl !== undefined) update.gl = body.gl;
  if (body.bcCategory !== undefined) update.bc_category = body.bcCategory;
  if (body.lines !== undefined) update.lines = body.lines;

  const admin = createAdminClient();
  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id, status: "approved" });
}
