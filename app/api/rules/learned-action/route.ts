import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Approve or reject a LEARNED item (the no-code maintenance gate). Approve promotes it from
 * learned→curated (locks it in); Reject removes the learned row so it stops being applied.
 * Operates on the existing learned rows (no separate candidates table):
 *   vendor     → vendors (approve: accepted=true,auto_added=false · reject: delete the auto-added row)
 *   identifier → identifier_index by (id_kind|normalized)
 *   alias      → field_aliases by (canonical_name|normalized)
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "server not configured" }, { status: 500 });

  let body: { kind?: string; key?: string; action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const kind = (body.kind ?? "").trim();
  const key = (body.key ?? "").trim();
  const action = (body.action ?? "").trim(); // approve | reject
  if (!kind || !key || !["approve", "reject"].includes(action))
    return NextResponse.json({ error: "kind, key, action(approve|reject) required" }, { status: 400 });

  const c = createAdminClient();
  try {
    if (kind === "vendor") {
      if (action === "approve") await c.from("vendors").update({ accepted: true, auto_added: false }).eq("canonical_name", key);
      else await c.from("vendors").delete().eq("canonical_name", key).eq("auto_added", true);
    } else if (kind === "identifier") {
      const [idKind, normalized] = key.split("|");
      if (action === "approve") await c.from("identifier_index").update({ source: "curated" }).eq("id_kind", idKind).eq("normalized", normalized);
      else await c.from("identifier_index").delete().eq("id_kind", idKind).eq("normalized", normalized).eq("source", "learned");
    } else if (kind === "alias") {
      const [canonical, normalized] = key.split("|");
      if (action === "approve") await c.from("field_aliases").update({ source: "curated" }).eq("canonical_name", canonical).eq("normalized", normalized);
      else await c.from("field_aliases").delete().eq("canonical_name", canonical).eq("normalized", normalized).eq("source", "learned");
    } else {
      return NextResponse.json({ error: `unknown kind ${kind}` }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
