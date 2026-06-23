import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/** Manually add a field to a document type's spec (the "look for"). L2: operator can enter fields. */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("rules");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; name?: string; required?: boolean; dataType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!docType || !name) return NextResponse.json({ error: "docType and name required" }, { status: 400 });
  const token = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const admin = createAdminClient();
  const { error } = await admin.from("doc_type_fields").upsert(
    { doc_type: docType, field_token: token, canonical_name: name, role: "payload", required: !!body.required, source: "curated" },
    { onConflict: "doc_type,field_token,role" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
