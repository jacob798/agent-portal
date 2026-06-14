import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Assign (or clear) the owning agent for a document type — the editable routing the
 * console was missing. agent="" clears the routing (unrouted). Sets the chosen agent as
 * primary; we keep it simple (one primary owner) — fan-out can be layered later.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { docType?: string; agent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const docType = (body.docType ?? "").trim();
  const agent = (body.agent ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });

  const admin = createAdminClient();
  // replace the routing for this type (single primary owner)
  await admin.from("doc_type_routing").delete().eq("doc_type", docType);
  if (agent) {
    const { error } = await admin
      .from("doc_type_routing")
      .insert({ doc_type: docType, agent, is_primary: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, agent: agent || null });
}
