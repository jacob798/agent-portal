import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/** "Populate fields from agents": flag the type so the worker writes its spec from the routed
 *  agents' contracts (agent_contracts.materialize_doc_type). Returns the routed agents to show. */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  if (!docType) return NextResponse.json({ error: "docType required" }, { status: 400 });

  const c = createAdminClient();
  const { data: routes } = await c.from("doc_type_routing").select("agent").eq("doc_type", docType);
  const agents = [...new Set((routes ?? []).map((r) => (r as { agent: string }).agent).filter(Boolean))];
  if (!agents.length) return NextResponse.json({ ok: true, agents: [] });
  const { error } = await c.from("doc_types").update({ materialize: true }).eq("doc_type", docType);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, agents });
}
