import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Set the owning agent(s) for a document type — supports FAN-OUT to multiple agents
 * (L5). Accepts `agents: string[]` (first = primary) or the legacy single `agent`.
 * Empty list clears the routing (unrouted).
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("rules");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { docType?: string; agent?: string; agents?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const docType = (body.docType ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });
  const list = (Array.isArray(body.agents) ? body.agents : [body.agent])
    .map((a) => (a ?? "").trim()).filter(Boolean);
  const ordered = [...new Set(list)]; // de-dup, preserve order (first = primary)

  const admin = createAdminClient();
  await admin.from("doc_type_routing").delete().eq("doc_type", docType);
  if (ordered.length) {
    const rows = ordered.map((agent, i) => ({ doc_type: docType, agent, is_primary: i === 0 }));
    const { error } = await admin.from("doc_type_routing").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, agents: ordered });
}
