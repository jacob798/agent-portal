import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Re-point a payable to an EXISTING vendor the operator picked from the vendor list
 * (distinct from Learn/Add which creates a new vendor record). Sets the row's vendor +
 * contact from the canonical `vendors` master, marks it accepted, and clears a stale
 * 'vendor' exception. If the master vendor carries a default entity / GL and the row is
 * missing them, they're applied as a convenience (the operator can still override).
 * The Dropbox file is renamed to match at post time (post_runner re-file).
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { id?: string; vendor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const vendor = (body.vendor ?? "").trim();
  if (!id || !vendor) return NextResponse.json({ error: "id and vendor required" }, { status: 400 });

  const admin = createAdminClient();

  // the row we're re-pointing
  const { data: row, error: rowErr } = await admin
    .from("payables_queue")
    .select("entity, exception, lines")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });

  // the canonical vendor record (contact + default coding)
  const { data: master } = await admin
    .from("vendors")
    .select("contact, entity_code, gl_full_name")
    .ilike("canonical_name", vendor)
    .limit(1)
    .maybeSingle();

  const update: Record<string, unknown> = {
    vendor,
    vendor_status: "accepted",
  };
  if (master?.contact) update.vendor_contact = master.contact;
  // a known vendor clears the "new/unrecognized vendor" exception
  if (row.exception === "vendor") {
    update.exception = null;
    update.reason = null;
  }
  // apply the master's default entity/GL only where the row is missing it
  const entity = row.entity || master?.entity_code || null;
  if (entity) update.entity = entity;
  const gl = master?.gl_full_name || null;
  if (gl) {
    update.gl = gl;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    if (lines.length) {
      lines[0] = { ...lines[0], gl };
      update.lines = lines;
    }
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id, vendor, entity, gl });
}
