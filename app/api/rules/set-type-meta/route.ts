import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/** Edit a document type's display name / category. */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("rules");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; label?: string; category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });
  const patch: Record<string, string> = {};
  if (body.label !== undefined && body.label.trim()) patch.display_name = body.label.trim();
  if (body.category !== undefined && body.category.trim()) patch.category = body.category.trim();
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const c = createAdminClient();
  const { error } = await c.from("doc_types").update(patch).eq("doc_type", docType);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
