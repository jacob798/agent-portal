/**
 * Vendor fingerprints — learned distinctive tokens → vendor, so the next similar invoice
 * IDs the vendor even when its own name isn't cleanly in the text (e.g. a Safeco policy
 * whose filename is `safplbill_…` and billing domain is `safeco.com`). Deterministic, no
 * LLM. The Python ingestion path reads the same `vendor_fingerprints` table.
 *
 * The portal learns/matches on data it already has WITHOUT re-OCR: the original upload
 * filename, the vendor contact's email/website domain, and the agency line — strong,
 * cheap signals. The backend CLI (reprocess.py) does the deeper OCR-based learning.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const STOP = new Set([
  "invoice", "account", "number", "amount", "payment", "billing", "statement",
  "summary", "total", "balance", "service", "services", "company", "customer",
  "please", "thank", "remit", "policy", "premium", "insurance", "online", "details",
  "purchase", "receipt", "document", "expense", "expenses", "software", "subscription",
  "subscriptions", "meals", "parking", "fuel", "travel", "hotel", "airfare", "other",
  "general", "misc", "miscellaneous", "vehicle", "dues", "professional", "fees", "order",
  "confirmation", "reference", "unknown", "vendor", "inc", "llc", "corp", "the", "and",
]);

// Generic mail hosts + our own domain — never a vendor fingerprint.
const DOMAIN_STOP = new Set([
  "foundry-capital.co", "gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
  "icloud.com", "me.com", "aol.com",
]);

// The account holder / entities are never a vendor — never learn a fingerprint for them.
const SELF = new Set([
  "jacob wolbach", "foundry capital", "foundry investments", "wjw investments idaho",
  "waterbrook", "iota street garden city", "prestwick capital", "prestwick funding b",
  "selkirk management", "builders capital",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(llc|inc|corp|co|company|ltd|the)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function isSelfName(name: string): boolean {
  return SELF.has(norm(name));
}

export function isTravelVendor(vendor: string): boolean {
  return /^travel /i.test(vendor ?? "");
}

export function domainsFrom(contact: unknown): string[] {
  const c = (contact ?? {}) as { email?: string; website?: string };
  const out: string[] = [];
  if (c.email && c.email.includes("@")) out.push(c.email.split("@")[1]);
  if (c.website) out.push(c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
  return out.map((d) => d.toLowerCase().trim()).filter((d) => d && !DOMAIN_STOP.has(d));
}

export function fingerprintTokens(parts: { filename?: string; domains?: string[]; agency?: string }): string[] {
  const toks = new Set<string>();
  for (const w of (parts.filename ?? "").toLowerCase().split(/[^a-z]+/)) {
    if (w.length >= 5 && !STOP.has(w)) toks.add(w);
  }
  for (const d of parts.domains ?? []) {
    const dl = d.replace(/^www\./, "");
    if (dl.length >= 5) toks.add(dl);
  }
  if (parts.agency) {
    const a = norm(parts.agency);
    if (a.length >= 5 && !STOP.has(a)) toks.add(a);
  }
  return [...toks].filter((t) => t.length >= 5 && !STOP.has(t));
}

/** Learn fingerprints for `vendor` from the data on a corrected row. Best-effort; returns
 *  the token count. Never learns for a self/bill-to name. */
export async function learnFingerprints(
  admin: SupabaseClient,
  vendor: string,
  parts: { filename?: string; domains?: string[]; agency?: string },
): Promise<number> {
  if (!vendor || isSelfName(vendor) || isTravelVendor(vendor) || norm(vendor).length <= 2) return 0;
  const toks = fingerprintTokens(parts);
  if (!toks.length) return 0;
  try {
    const rows = toks.map((token) => ({ token, vendor }));
    const { error } = await admin.from("vendor_fingerprints").upsert(rows, { onConflict: "token" });
    return error ? 0 : toks.length;
  } catch {
    return 0;
  }
}

/** The original upload filename for a payables row (richest fingerprint), from ingestion_jobs. */
export async function originalFilename(admin: SupabaseClient, id: string): Promise<string> {
  try {
    const { data } = await admin
      .from("ingestion_jobs")
      .select("original_filename")
      .eq("result_id", id)
      .limit(1)
      .maybeSingle();
    return data?.original_filename ?? "";
  } catch {
    return "";
  }
}
