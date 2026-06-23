import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/** Create a new document type (e.g. train_confirmation). Optionally route it to agent(s). */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("rules");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { label?: string; docType?: string; category?: string; agents?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const label = (body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  // slug from the label unless one is given
  const slug = ((body.docType ?? "").trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
  if (!slug) return NextResponse.json({ error: "could not derive a slug" }, { status: 400 });
  const category = (body.category ?? "").trim() || "Uncategorized";

  const c = createAdminClient();
  const exists = await c.from("doc_types").select("doc_type").eq("doc_type", slug).maybeSingle();
  if (exists.data) return NextResponse.json({ error: `type '${slug}' already exists` }, { status: 409 });
  const { error } = await c.from("doc_types").insert({
    doc_type: slug, display_name: label, category, status: "parked", source: "curated",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const agents = [...new Set((body.agents ?? []).map((a) => a.trim()).filter(Boolean))];
  if (agents.length) {
    await c.from("doc_type_routing").insert(agents.map((agent, i) => ({ doc_type: slug, agent, is_primary: i === 0 })));
  }
  return NextResponse.json({ ok: true, docType: slug });
}
