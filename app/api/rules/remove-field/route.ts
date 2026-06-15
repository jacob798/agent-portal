import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/** Remove a field from a document type's spec (+ its type-scoped aliases). */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; field?: string; scope?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  const field = (body.field ?? "").trim();
  if (!docType || !field) return NextResponse.json({ error: "docType and field required" }, { status: 400 });

  const c = createAdminClient();
  let q = c.from("doc_type_fields").delete().eq("doc_type", docType).eq("canonical_name", field);
  if (body.scope) q = q.eq("scope", body.scope.trim());
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // drop the type-scoped aliases for this field too (keep the shared field_dictionary entry)
  await c.from("field_aliases").delete().eq("scope", "type").eq("scope_key", docType).eq("canonical_name", field);
  return NextResponse.json({ ok: true });
}
