import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Create or edit a vendor master record (the new/edit-vendor modal). Writes the `vendors`
 * master — canonical_name, aliases, default entity/GL coding, auto_approve, and contact.
 * Keyed by canonical_name (how the rest of the app updates vendors): if a row with that name
 * exists we UPDATE it, else we INSERT a new accepted record. Saving here marks the vendor
 * accepted (not an auto-added stub). The per-entity QBO presence (vendor_qbo_refs) is created
 * at post via match-before-create — not written here.
 */
/** Load a vendor master record by canonical_name so the edit modal can prefill (and a save
 *  never wipes aliases/defaults it didn't show). Returns null fields for a brand-new name. */
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ vendor: null });
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ vendor: null });
  const admin = createAdminClient();
  const { data } = await admin
    .from("vendors")
    .select("canonical_name, aliases, entity_code, gl_full_name, auto_approve, contact, accepted, record")
    .eq("canonical_name", name).maybeSingle();
  if (!data) return NextResponse.json({ vendor: null });
  const rec = (data.record ?? {}) as { identity?: { primary_category?: string | null } };
  return NextResponse.json({ vendor: { ...data, category: rec.identity?.primary_category ?? null } });
}

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: {
    name?: string; originalName?: string; aliases?: string[];
    entity?: string | null; gl?: string | null; autoApprove?: boolean;
    contact?: Record<string, unknown> | null; category?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const category = (body.category ?? "").trim();
  if (!category) return NextResponse.json({ error: "category required" }, { status: 400 });
  const aliases = Array.isArray(body.aliases) ? body.aliases.map((a) => String(a).trim()).filter(Boolean) : [];

  const admin = createAdminClient();
  // Match the existing record by the name we OPENED with (originalName) so a rename still
  // updates the same row; fall back to the new name.
  const lookup = (body.originalName ?? name).trim();
  const { data: existing, error: findErr } = await admin
    .from("vendors").select("vendor_id, contact, record").eq("canonical_name", lookup).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  // Merge contact onto any existing contact jsonb so we don't drop fields the modal didn't show.
  const contact = { ...((existing?.contact as Record<string, unknown>) ?? {}), ...(body.contact ?? {}) };
  // Vendor category lives in record.identity.primary_category (same field the LLM pull writes and
  // getVendors reads). Merge so we never drop other record sections.
  const prevRec = (existing?.record ?? {}) as Record<string, unknown>;
  const prevIdentity = (prevRec.identity ?? {}) as Record<string, unknown>;
  const record = { ...prevRec, identity: { ...prevIdentity, primary_category: category } };
  const patch = {
    canonical_name: name,
    aliases,
    entity_code: body.entity || null,
    gl_full_name: body.gl || null,
    auto_approve: !!body.autoApprove,
    contact,
    record,
    accepted: true,
    auto_added: false,
    updated_at: new Date().toISOString(),
  };

  if (existing?.vendor_id) {
    const { error } = await admin.from("vendors").update(patch).eq("vendor_id", existing.vendor_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, vendor_id: existing.vendor_id, mode: "updated" });
  }
  const vendor_id = `v_${randomUUID().slice(0, 12)}`;
  const { error } = await admin.from("vendors").insert({ vendor_id, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vendor_id, mode: "created" });
}
