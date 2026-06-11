import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * "Save & remember": learn a vendor's coding once, applied to all of its queued
 * invoices — WITHOUT auto-approving the transactions. Confirming the vendor
 * *setup* is not the same as reviewing each *charge*: the queued invoices get
 * the coding pre-filled but stay in the queue (status open, not auto) for the
 * operator to review and post. The vendor_rules entry means FUTURE invoices
 * auto-code; the ones already in the queue still get a human glance.
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

  let body: { vendor?: string; entity?: string; gl?: string; bcCategory?: string | null; autoApprove?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const vendor = (body.vendor ?? "").trim();
  const entity = body.entity ?? null;
  const gl = body.gl ?? null;
  const autoApprove = body.autoApprove === true;
  if (!vendor) return NextResponse.json({ error: "vendor required" }, { status: 400 });

  const admin = createAdminClient();

  // 1) Apply the coding to every still-open row for this vendor. When the
  // operator chose "approve all going forward", also approve (stage) them now;
  // otherwise they stay in the queue for per-charge review + post.
  const now = new Date().toISOString();
  const rowUpdate: Record<string, unknown> = autoApprove
    ? { auto: true, exception: null, reason: null, status: "approved", approved_at: now }
    : { auto: false, exception: null, reason: "Coded from vendor rule — review & post" };
  if (entity) rowUpdate.entity = entity;
  if (gl) rowUpdate.gl = gl;
  if (body.bcCategory !== undefined) rowUpdate.bc_category = body.bcCategory;

  const { data: coded, error: e1 } = await admin
    .from("payables_queue")
    .update(rowUpdate)
    .ilike("vendor", vendor)
    .in("status", ["open"])
    .select("id");
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // 2) Remember it: standing vendor rule. auto_approve=true makes FUTURE invoices
  // auto-approve (skip review); otherwise they auto-code but await review.
  const { error: e2 } = await admin.from("vendor_rules").upsert(
    { vendor, entity_code: entity, gl_full_name: gl, auto_approve: autoApprove, source: "portal", updated_at: now },
    { onConflict: "vendor" },
  );
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // 3) ENTITY-SPECIFIC GL: the GL is per (vendor, entity) — every company has its own
  // chart. Record this so the entity stays trusted next time and seeds cross-entity
  // prediction (a new entity for this vendor predicts its GL from this one).
  if (entity && gl) {
    const { error: e3 } = await admin.from("vendor_entity_coding").upsert(
      { vendor, entity_code: entity, gl, auto_approve: autoApprove, updated_at: now },
      { onConflict: "vendor,entity_code" },
    );
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: coded?.length ?? 0, autoApprove });
}
