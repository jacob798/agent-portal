import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/** Queue an AI (re)generation of a document type's context. The worker runs the strong-model
 *  pass (samples + fields → narrative + suggested fields) and writes doc_types.context_template. */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("rules");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("doc_types").update({ regen_context: true }).eq("doc_type", docType);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, queued: true });
}
