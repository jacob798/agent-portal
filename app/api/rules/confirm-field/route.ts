import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/** Confirm a suggested (learned) field on a document type → promote it to curated (locked in). */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; field?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  const field = (body.field ?? "").trim();
  if (!docType || !field) return NextResponse.json({ error: "docType + field required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("doc_type_fields").update({ source: "curated" }).eq("doc_type", docType).eq("canonical_name", field);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
