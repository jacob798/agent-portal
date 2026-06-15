import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/** Save an operator-edited document-type context (the narrative) + purpose. L7: edits persist. */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; context?: string; purpose?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });
  const patch: Record<string, string | null> = {};
  if (body.context !== undefined) patch.context_template = body.context;
  if (body.purpose !== undefined) patch.purpose = body.purpose;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("doc_types").update(patch).eq("doc_type", docType);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
