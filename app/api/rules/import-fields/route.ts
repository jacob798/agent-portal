import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Bulk-import a document type's field spec from a CSV the operator generated in Claude.
 * Body: { docType, fields: [{ name, type?, required?, aliases?: string[], example? }] }.
 * Writes field_dictionary (so the alias FK holds) + doc_type_fields + field_aliases, all
 * source='curated'. Idempotent (upserts).
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });

  let body: { docType?: string; fields?: { name?: string; type?: string; required?: boolean; aliases?: string[]; example?: string; scope?: string; key?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  const fields = Array.isArray(body.fields) ? body.fields : [];
  if (!docType || !fields.length) return NextResponse.json({ error: "docType and fields required" }, { status: 400 });

  const c = createAdminClient();
  const token = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // REPLACE semantics: the imported CSV is the authoritative spec for this type. Clear the
  // type's existing fields + type-scoped aliases first, so re-importing a corrected CSV doesn't
  // accumulate and the seed's universal fields don't linger alongside it.
  await c.from("doc_type_fields").delete().eq("doc_type", docType);
  await c.from("field_aliases").delete().eq("scope", "type").eq("scope_key", docType);

  let imported = 0, aliasCount = 0;
  for (const f of fields) {
    const name = (f.name ?? "").trim();
    if (!name) continue;
    const dataType = (f.type ?? "text").trim().toLowerCase() || "text";
    const scope = (f.scope ?? "document").trim().toLowerCase() || "document";
    const fieldKey = (f.key ?? "").trim().toLowerCase() || null;
    // field_token includes the scope so the SAME logical field name can live in two scopes
    // (header vs a repeating group) without colliding on the (doc_type, field_token, role) key.
    const ft = scope === "document" ? token(name) : `${token(scope)}.${token(name)}`;
    // 1) field_dictionary — needed before any alias (FK target)
    await c.from("field_dictionary").upsert(
      { canonical_name: name, data_type: dataType, source: "curated" },
      { onConflict: "canonical_name" },
    );
    // 2) doc_type_fields — this type's "look for" (scope = document | a repeating-group name)
    await c.from("doc_type_fields").upsert(
      { doc_type: docType, field_token: ft, canonical_name: name, role: "payload",
        required: !!f.required, source: "curated", scope, field_key: fieldKey,
        last_value: f.example ? String(f.example).slice(0, 200) : null },
      { onConflict: "doc_type,field_token,role" },
    );
    imported++;
    // 3) field_aliases — the document labels that map to this field (scoped to this type)
    for (const a of f.aliases ?? []) {
      const alias = (a ?? "").trim();
      if (!alias) continue;
      const { error } = await c.from("field_aliases").upsert(
        { canonical_name: name, alias_text: alias, normalized: norm(alias),
          scope: "type", scope_key: docType, source: "curated" },
        { onConflict: "canonical_name,normalized,scope,scope_key" },
      );
      if (!error) aliasCount++;
    }
  }
  return NextResponse.json({ ok: true, imported, aliases: aliasCount });
}
