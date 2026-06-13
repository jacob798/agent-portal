import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { domainsFrom, isSelfName, isTravelVendor, learnFingerprints } from "@/lib/payables/fingerprints";

/**
 * "Reprocess vendors" — re-run vendor ID on the existing backlog using everything we've
 * learned, WITHOUT re-OCR (so it's instant and runs on Vercel):
 *   • a row whose vendor reads as the bill-to (Jacob Wolbach) or is unknown gets matched
 *     against learned FINGERPRINTS (filename stem, billing domain, agency) → real vendor;
 *   • if still unmatched, a bill-to/self vendor is FLAGGED as a 'vendor' exception so it
 *     surfaces for review instead of posting as "Jacob Wolbach".
 * After you teach one Safeco invoice, a whole batch of the same ones fixes in one click.
 * (The backend CLI agents.payables.core.reprocess does the deeper OCR-based pass.)
 */
export async function POST() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  const admin = createAdminClient();

  // ── LEARN: seed fingerprints from operator-CONFIRMED vendors (filename stem + billing
  // domain), so a backlog can be fixed even before any new correction this session. ──
  const { data: accepted } = await admin
    .from("payables_queue")
    .select("id, vendor, vendor_contact")
    .eq("vendor_status", "accepted");
  const acceptedIds = (accepted ?? []).map((r) => r.id);
  const acceptedFname = new Map<string, string>();
  if (acceptedIds.length) {
    const { data: jobs } = await admin
      .from("ingestion_jobs")
      .select("result_id, original_filename")
      .in("result_id", acceptedIds);
    for (const j of jobs ?? []) if (j.result_id) acceptedFname.set(j.result_id, j.original_filename ?? "");
  }
  let learned = 0;
  for (const r of accepted ?? []) {
    const v = (r.vendor ?? "").trim();
    if (!v || isSelfName(v) || isTravelVendor(v)) continue;
    learned += await learnFingerprints(admin, v, {
      filename: acceptedFname.get(r.id) ?? "",
      domains: domainsFrom(r.vendor_contact),
    });
  }

  // learned fingerprints (token → vendor)
  const { data: fps } = await admin.from("vendor_fingerprints").select("token, vendor");
  const fingerprints = (fps ?? []).map((f) => ({ token: String(f.token).toLowerCase(), vendor: f.vendor as string }));

  // active queue rows (small) — filter for the ones that need attention in JS
  const { data: rows } = await admin
    .from("payables_queue")
    .select("id, vendor, vendor_status, exception, doc_path, vendor_contact, sub, gl, lines")
    .not("status", "in", "(posted,discarded)");

  // a re-identified vendor brings its CATEGORY/GL too — look up known vendor coding once.
  const { data: vmaster } = await admin.from("vendors").select("canonical_name, gl_full_name");
  const glByVendor = new Map<string, string>();
  for (const v of vmaster ?? []) {
    if (v.canonical_name && v.gl_full_name) glByVendor.set(String(v.canonical_name).toLowerCase(), v.gl_full_name);
  }

  // original filenames (richest signal) keyed by row id
  const ids = (rows ?? []).map((r) => r.id);
  const fnameById = new Map<string, string>();
  if (ids.length) {
    const { data: jobs } = await admin
      .from("ingestion_jobs")
      .select("result_id, original_filename")
      .in("result_id", ids);
    for (const j of jobs ?? []) if (j.result_id) fnameById.set(j.result_id, j.original_filename ?? "");
  }

  const changes: { id: string; from: string; to: string; gl?: string }[] = [];
  let flagged = 0;
  for (const r of rows ?? []) {
    const vendor = (r.vendor ?? "").trim();
    const needs =
      isSelfName(vendor) || !vendor || vendor.toLowerCase() === "unknown vendor" ||
      r.vendor_status === "new" || r.exception === "vendor";
    if (!needs) continue;

    const contact = (r.vendor_contact ?? {}) as { email?: string; website?: string };
    const hay = [
      fnameById.get(r.id) ?? "",
      (r.doc_path ?? "").split("/").pop() ?? "",
      contact.email ?? "",
      contact.website ?? "",
      typeof r.sub === "string" ? r.sub : "",
    ].join("\n").toLowerCase();

    // earliest-matching fingerprint wins
    let best: { vendor: string; pos: number } | null = null;
    for (const f of fingerprints) {
      if (f.token.length < 5 || isSelfName(f.vendor)) continue;
      const pos = hay.indexOf(f.token);
      if (pos !== -1 && (!best || pos < best.pos)) best = { vendor: f.vendor, pos };
    }

    if (best && best.vendor.toLowerCase() !== vendor.toLowerCase()) {
      // a re-identified vendor brings its category/GL too, so the queue shows full coding
      const newGl = glByVendor.get(best.vendor.toLowerCase()) ?? (typeof r.gl === "string" ? r.gl : undefined);
      const lines = Array.isArray(r.lines) ? r.lines : [];
      const newLines = newGl && lines.length ? [{ ...lines[0], gl: newGl }, ...lines.slice(1)] : r.lines;
      await admin
        .from("payables_queue")
        .update({
          vendor: best.vendor,
          vendor_status: "on_file",
          ...(newGl ? { gl: newGl, lines: newLines } : {}),
          exception: r.exception === "vendor" ? null : r.exception,
          reason: r.exception === "vendor" ? "Vendor re-identified on reprocess" : undefined,
        })
        .eq("id", r.id);
      changes.push({ id: r.id, from: vendor, to: best.vendor, gl: newGl });
    } else if (isSelfName(vendor) && r.exception !== "vendor") {
      // bill-to as vendor with nothing learned yet → surface it for review, don't post as-is
      await admin
        .from("payables_queue")
        .update({ exception: "vendor", auto: false, reason: "Vendor reads as the bill-to — pick the real biller" })
        .eq("id", r.id);
      flagged += 1;
    }
  }

  // ── APPLY learned vendor RULES to still-open rows ──────────────────────────
  // "Reprocess" means "apply everything we've learned". A row whose vendor now has a
  // saved rule (entity + GL) but whose coding doesn't match it — e.g. it was coded under
  // the wrong vendor before the rule existed, or the vendor was just re-identified above —
  // gets the rule's coding. OPEN rows only: never touch approved/posted (operator-confirmed)
  // coding. This is the fix for "I taught the vendor's defaults but the batch didn't update".
  const { data: rules } = await admin.from("vendor_rules").select("vendor, entity_code, gl_full_name");
  const ruleByVendor = new Map<string, { entity: string | null; gl: string | null }>();
  for (const rl of rules ?? []) {
    if (rl.vendor) ruleByVendor.set(String(rl.vendor).toLowerCase(), { entity: rl.entity_code ?? null, gl: rl.gl_full_name ?? null });
  }
  let recoded = 0;
  const { data: openRows } = await admin
    .from("payables_queue")
    .select("id, vendor, entity, gl, lines")
    .eq("status", "open");
  for (const r of openRows ?? []) {
    const rule = ruleByVendor.get(String(r.vendor ?? "").toLowerCase());
    if (!rule) continue;
    const patch: Record<string, unknown> = {};
    if (rule.entity && r.entity !== rule.entity) patch.entity = rule.entity;
    if (rule.gl && r.gl !== rule.gl) {
      patch.gl = rule.gl;
      const lines = Array.isArray(r.lines) ? r.lines : [];
      if (lines.length) patch.lines = [{ ...lines[0], gl: rule.gl }, ...lines.slice(1)];
    }
    if (Object.keys(patch).length) {
      patch.exception = null;
      await admin.from("payables_queue").update(patch).eq("id", r.id);
      recoded += 1;
    }
  }

  return NextResponse.json({ ok: true, learned, fixed: changes.length, flagged, recoded, changes });
}
