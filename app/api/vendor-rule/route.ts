import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Persist an "always code <vendor> this way" rule. Upserts into vendor_rules,
 * which the agent-system payables processor reads as an override layer over
 * vendor_master.json. Requires an authenticated operator.
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

  let body: { vendor?: string; entity_code?: string; gl_full_name?: string; pay_method_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const vendor = (body.vendor ?? "").trim();
  if (!vendor) return NextResponse.json({ error: "vendor is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("vendor_rules").upsert(
    {
      vendor,
      entity_code: body.entity_code ?? null,
      gl_full_name: body.gl_full_name ?? null,
      pay_method_id: body.pay_method_id ?? null,
      source: "portal",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "vendor" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, vendor });
}
