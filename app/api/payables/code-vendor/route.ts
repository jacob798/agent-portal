import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * "Save & remember": apply one coding decision to a whole vendor. Updates every
 * still-open queued row for the vendor (entity + GL, marks it coded) AND upserts
 * a vendor_rules entry so future invoices auto-code. This is how the system
 * learns from manual entries — one save handles all of a vendor's invoices.
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

  let body: { vendor?: string; entity?: string; gl?: string; bcCategory?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const vendor = (body.vendor ?? "").trim();
  const entity = body.entity ?? null;
  const gl = body.gl ?? null;
  if (!vendor) return NextResponse.json({ error: "vendor required" }, { status: 400 });

  const admin = createAdminClient();

  // 1) Code every still-open row for this vendor (case-insensitive).
  const rowUpdate: Record<string, unknown> = {
    auto: true,
    exception: null,
    reason: null,
  };
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

  // 2) Remember it: standing vendor rule (override layer the processor reads).
  const { error: e2 } = await admin.from("vendor_rules").upsert(
    { vendor, entity_code: entity, gl_full_name: gl, source: "portal", updated_at: new Date().toISOString() },
    { onConflict: "vendor" },
  );
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: coded?.length ?? 0 });
}
