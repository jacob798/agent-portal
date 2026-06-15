import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/** Edit a vendor's coding defaults (entity / GL) from the Vendors tab. */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { vendor?: string; entity?: string; gl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const vendor = (body.vendor ?? "").trim();
  if (!vendor) return NextResponse.json({ error: "vendor required" }, { status: 400 });
  const patch: Record<string, string | null> = {};
  if (body.entity !== undefined) patch.entity_code = body.entity.trim() || null;
  if (body.gl !== undefined) patch.gl_full_name = body.gl.trim() || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("vendors").update({ ...patch, accepted: true }).eq("canonical_name", vendor);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
