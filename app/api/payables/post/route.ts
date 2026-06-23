import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Approve a payables row: persist the operator's confirmed coding (entity,
 * pay-from account, per-line entity/GL, BC category) and mark it
 * status='approved' — staged for the QuickBooks batch post. The backend
 * post_runner flips it to 'posted' once written to QBO.
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

  let body: {
    id?: string;
    entity?: string | null;
    account?: string | null;
    paymentMethodId?: string | null;
    gl?: string | null;
    bcCategory?: string | null;
    posting?: string | null;
    lines?: { desc: string; amount: number; gl: string; entity?: string; bcCategory?: string }[];
    /** false = save coding only (stays in the queue); true (default) = stage for QBO. */
    approve?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const approve = body.approve !== false; // default true
  const update: Record<string, unknown> = approve
    ? { auto: true, exception: null, reason: null, status: "approved", approved_at: new Date().toISOString() }
    : // save coding only — the operator still reviews + posts the charge
      { auto: false, exception: null, reason: "Coded — review & post" };
  if (body.entity !== undefined) update.entity = body.entity;
  if (body.account !== undefined) update.account = body.account;
  if (body.paymentMethodId !== undefined) update.payment_method_id = body.paymentMethodId;
  if (body.gl !== undefined) update.gl = body.gl;
  if (body.bcCategory !== undefined) update.bc_category = body.bcCategory;
  if (body.posting !== undefined && body.posting !== null) update.posting = body.posting;
  if (body.lines !== undefined) update.lines = body.lines;

  const admin = createAdminClient();
  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Learn the per-vendor LINE LAYOUT (entity + account per line) when the operator saved a
  // multi-entity split — so the next invoice from this vendor REPLAYS the same lines and the
  // operator only enters the amounts (Jacob's simplification; no parser splitting). Stores
  // the structure only, never the amounts. Best-effort; never fails the save.
  const lines = body.lines ?? [];
  const distinctEntities = new Set(lines.map((l) => l.entity).filter(Boolean));
  if (lines.length >= 2 && distinctEntities.size >= 2) {
    try {
      const { data: row } = await admin.from("payables_queue").select("vendor").eq("id", id).single();
      const vendor = (row?.vendor ?? "").trim();
      if (vendor) {
        const layout = lines.map((l) => ({
          entity: l.entity ?? null,
          gl: l.gl ?? null,
          amount: l.amount ?? 0, // prior amount → prefilled next time (operator adjusts)
          ...(l.bcCategory ? { bcCategory: l.bcCategory } : {}),
        }));
        await admin
          .from("vendor_line_templates")
          .upsert({ vendor, lines: layout, updated_at: new Date().toISOString() }, { onConflict: "vendor" });
      }
    } catch {
      /* best-effort — learning the layout must never block the save */
    }
  }

  return NextResponse.json({ ok: true, id, status: "approved" });
}
