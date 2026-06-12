import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Apply the same coding change to many invoices at once (mass edit): posting
 * type, entity, pay-from account, GL, BC category. Only the fields provided are
 * changed; the lines' entity/gl are kept in sync with the row when given.
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
    ids?: string[];
    entity?: string | null;
    posting?: string | null;
    gl?: string | null;
    paymentMethodId?: string | null;
    account?: string | null;
    bcCategory?: string | null;
    vendor?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x.trim());
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch the rows so we can keep each line's entity/gl in sync with the change.
  const { data: rows, error: e0 } = await admin
    .from("payables_queue")
    .select("id, lines, entity, gl")
    .in("id", ids);
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 });

  let n = 0;
  for (const r of rows ?? []) {
    const patch: Record<string, unknown> = {};
    if (body.entity !== undefined) patch.entity = body.entity;
    if (body.posting !== undefined) patch.posting = body.posting;
    if (body.gl !== undefined) patch.gl = body.gl;
    if (body.paymentMethodId !== undefined) patch.payment_method_id = body.paymentMethodId;
    if (body.account !== undefined) patch.account = body.account;
    if (body.bcCategory !== undefined) patch.bc_category = body.bcCategory;
    if (body.vendor !== undefined && body.vendor !== null && String(body.vendor).trim()) {
      patch.vendor = String(body.vendor).trim();
      patch.vendor_status = "accepted";
    }
    // A coding change makes the row coded & ready to review/post.
    if (body.entity !== undefined || body.gl !== undefined || body.posting !== undefined) {
      patch.auto = false;
      patch.exception = null;
      patch.reason = "Coded — review & post";
    }
    // Mirror entity/gl onto the line items so per-line coding + posting stay correct.
    const lines = Array.isArray(r.lines) ? r.lines : [];
    if ((body.entity !== undefined || body.gl !== undefined) && lines.length) {
      patch.lines = lines.map((l: Record<string, unknown>) => ({
        ...l,
        ...(body.entity !== undefined ? { entity: body.entity } : {}),
        ...(body.gl !== undefined ? { gl: body.gl } : {}),
      }));
    }
    const { error } = await admin.from("payables_queue").update(patch).eq("id", r.id);
    if (!error) n += 1;
  }

  return NextResponse.json({ ok: true, updated: n });
}
