import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { isSelfName } from "@/lib/payables/fingerprints";

/**
 * Persist an "always code <vendor> this way" rule. Upserts into vendor_rules,
 * which the agent-system payables processor reads as an override layer over
 * vendor_master.json. Requires an authenticated operator.
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

  let body: Record<string, string | string[] | undefined>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const vendor = (str(body.vendor) ?? "").trim();
  // The card(s) the operator was on — apply the new coding to these rows even if they're
  // still mis-vendored (e.g. queued as "United"); without this, teaching a vendor never
  // populated the row you were looking at.
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (!vendor) return NextResponse.json({ error: "vendor is required" }, { status: 400 });
  // never learn a rule for the account holder / a bill-to entity — it's not a vendor
  if (isSelfName(vendor)) {
    return NextResponse.json(
      { error: `'${vendor}' is the bill-to / account holder, not a vendor.` },
      { status: 400 },
    );
  }

  const entity = str(body.entity_code) ?? null;
  const gl = str(body.gl_full_name) ?? null;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("vendor_rules").upsert(
    {
      vendor,
      entity_code: entity,
      gl_full_name: gl,
      pay_method_id: str(body.pay_method_id) ?? null,
      // Full vendor record — written to both QuickBooks vendor + Outlook contact.
      display_name: str(body.display_name) ?? null,
      email: str(body.email) ?? null,
      phone: str(body.phone) ?? null,
      website: str(body.website) ?? null,
      street: str(body.street) ?? null,
      city: str(body.city) ?? null,
      state: str(body.state) ?? null,
      zip: str(body.zip) ?? null,
      terms: str(body.terms) ?? null,
      account_number: str(body.account_number) ?? null,
      source: "portal",
      updated_at: now,
    },
    { onConflict: "vendor" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── APPLY the learned coding to the queue NOW (not just future invoices) ──
  // Saving a vendor setup must populate (a) every still-open invoice already in the
  // queue for this vendor, and (b) the card(s) the operator was on — even if those
  // rows are still mis-vendored (so we also correct their vendor name). Future-only
  // application is what made "teach → reprocess → nothing changed" happen.
  const coding: Record<string, unknown> = { exception: null, reason: "Coded from vendor setup — review & post" };
  if (entity) coding.entity = entity;
  if (gl) coding.gl = gl;

  let coded = 0;
  // (a) open rows already vendored as this vendor
  {
    const { data } = await admin
      .from("payables_queue")
      .update(coding)
      .ilike("vendor", vendor)
      .eq("status", "open")
      .select("id");
    coded += data?.length ?? 0;
  }
  // (b) the originating card(s): set the vendor too, so a row mis-queued as "United"
  // becomes this vendor with the coding. Only touch rows not yet posted/discarded.
  if (ids.length) {
    const { data } = await admin
      .from("payables_queue")
      .update({ ...coding, vendor, vendor_status: "on_file" })
      .in("id", ids)
      .not("status", "in", "(posted,discarded)")
      .select("id");
    coded += data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, vendor, coded });
}
