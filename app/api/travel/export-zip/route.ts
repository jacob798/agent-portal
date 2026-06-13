import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Trip expense-report .zip: a manifest CSV + every receipt PDF on the trip, bundled for
 * reimbursement / records. Receipts are fetched from their Dropbox share links. Replaces
 * the old toast-only stub on the Travel report.
 *
 * GET /api/travel/export-zip?trip=<id>
 */
export const runtime = "nodejs";
export const maxDuration = 60;

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// A Dropbox share link returns an HTML preview unless forced to download — `?dl=1`.
function forceDownload(url: string): string {
  if (/[?&]dl=1/.test(url)) return url;
  if (/[?&]dl=0/.test(url)) return url.replace(/dl=0/, "dl=1");
  return url + (url.includes("?") ? "&dl=1" : "?dl=1");
}

function safe(s: string): string {
  return (s || "").replace(/[^\w.\-]+/g, "_").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }
  const tripId = new URL(req.url).searchParams.get("trip")?.trim();
  if (!tripId) return NextResponse.json({ error: "trip id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id, ent, dest, dates, purpose")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });

  const { data: rows } = await admin
    .from("payables_queue")
    .select("vendor, memo, amount, category, bc_category, gl, doc_url, txn_date, extracted")
    .eq("trip_id", tripId)
    .order("txn_date");
  const exps = rows ?? [];

  const zip = new JSZip();
  const tripVendor = exps[0]?.vendor ?? `Trip ${trip.dest}`;

  // 1) manifest CSV
  const header = ["Date", "Merchant", "Category", "Amount", "Receipt", "QB Vendor"];
  const lines = [header.map(csvCell).join(",")];
  for (const e of exps) {
    const merchant = (e.extracted as { payee?: string } | null)?.payee || e.memo || e.vendor;
    const cat = e.bc_category || e.category || e.gl || "";
    lines.push([e.txn_date || trip.dates, merchant, cat, e.amount, e.doc_url ? "yes" : "MISSING", tripVendor].map(csvCell).join(","));
  }
  zip.file("expense-summary.csv", lines.join("\n"));

  // 2) the receipt PDFs
  const receipts = zip.folder("receipts")!;
  let attached = 0;
  let missing = 0;
  for (const e of exps) {
    if (!e.doc_url) { missing += 1; continue; }
    try {
      const res = await fetch(forceDownload(e.doc_url));
      if (!res.ok) { missing += 1; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const merchant = (e.extracted as { payee?: string } | null)?.payee || e.vendor;
      receipts.file(`${safe(String(e.txn_date || ""))}_${safe(merchant)}_${e.amount}.pdf`, buf);
      attached += 1;
    } catch {
      missing += 1;
    }
  }

  const blob = await zip.generateAsync({ type: "nodebuffer" });
  const fname = `${safe(trip.dest)}_expense_report.zip`;
  return new NextResponse(new Uint8Array(blob), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "X-Receipts-Attached": String(attached),
      "X-Receipts-Missing": String(missing),
    },
  });
}
