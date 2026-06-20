import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { ENT } from "@/lib/data/entities";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── BCX brand palette ───────────────────────────────────────────────────────
const OXFORD = rgb(0x10 / 255, 0x10 / 255, 0x2e / 255); // #10102e
const LIME = rgb(0x7b / 255, 0xbf / 255, 0x43 / 255); // #7bbf43
const GREEN = rgb(0x17 / 255, 0x72 / 255, 0x45 / 255); // #177245
const GRAY = rgb(0.42, 0.46, 0.52);
const RED = rgb(0.78, 0.22, 0.22);

interface ExpDb {
  id: string;
  txn_date: string | null;
  vendor: string | null;
  entity: string | null;
  account: string | null;
  bc_category: string | null;
  gl: string | null;
  amount: number | string | null;
  reimbursement_amount: number | string | null;
  payment_method_id: string | null;
  memo: string | null;
  doc_url: string | null;
  trip_id: string | null;
  extracted: { payee?: string; traveler?: string } | null;
}
interface TripDb {
  id: string;
  dest: string | null;
  purpose: string | null;
  start_date: string | null;
  end_date: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtDate = (iso?: string | null): string => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};
const fmtMD = (iso?: string | null): string => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}` : iso;
};
function tripLabel(t?: TripDb | null): string {
  if (!t) return "Non-trip";
  const range = t.start_date && t.end_date ? `${fmtMD(t.start_date)}-${fmtMD(t.end_date)}` : "";
  return [t.dest, t.purpose, range].filter(Boolean).join(" · ") || "Trip";
}
const payeeOf = (e: ExpDb): string => e.extracted?.payee || e.vendor || "—";
const acctOf = (e: ExpDb): string => e.bc_category || e.gl || e.account || "";
const safe = (s: string): string => (s || "").replace(/[^\w.\-]+/g, "_").slice(0, 80);
function forceDownload(url: string): string {
  if (/[?&]dl=1/.test(url)) return url;
  if (/[?&]dl=0/.test(url)) return url.replace(/dl=0/, "dl=1");
  return url + (url.includes("?") ? "&dl=1" : "?dl=1");
}

// ─── XLSX ────────────────────────────────────────────────────────────────────
function buildXlsx(exps: ExpDb[], trips: Map<string, TripDb>): Uint8Array {
  const rows = exps.map((e) => ({
    Title: payeeOf(e),
    "Transaction Date": fmtDate(e.txn_date),
    "Payment Method": e.account || e.payment_method_id || "",
    Account: acctOf(e),
    Amount: Number((e.reimbursement_amount == null || e.reimbursement_amount === "" ? num(e.amount) : num(e.reimbursement_amount)).toFixed(2)),
    Traveler: e.extracted?.traveler || "",
    Trip: e.trip_id ? tripLabel(trips.get(e.trip_id)) : "Non-trip",
    Notes: e.memo || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Title", "Transaction Date", "Payment Method", "Account", "Amount", "Traveler", "Trip", "Notes"],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────
function clip(font: PDFFont, text: string, size: number, maxW: number): string {
  let t = String(text ?? "");
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2);
  return t === String(text ?? "") ? t : t.replace(/.$/, "…");
}
function cell(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = OXFORD, rightX?: number) {
  const t = String(text ?? "");
  if (rightX != null) page.drawText(t, { x: rightX - font.widthOfTextAtSize(t, size), y, size, font, color });
  else page.drawText(t, { x, y, size, font, color });
}

interface ReportMeta {
  name: string;
  entity: string;
  dateFrom: string | null;
  dateTo: string | null;
  submittedBy: string;
  payrollPaid: string | null;
}

/** BCX-branded expense report PDF — line items GROUPED by trip. No footer. */
async function buildReportPdf(meta: ReportMeta, exps: ExpDb[], trips: Map<string, TripDb>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 50, RIGHT = 612 - M, W = RIGHT - M;
  let page = doc.addPage([612, 792]);
  let y = 792 - M;

  // brand bar: Oxford then Lime
  page.drawRectangle({ x: M, y: y - 2, width: W, height: 6, color: OXFORD });
  page.drawRectangle({ x: M, y: y - 9, width: W, height: 3, color: LIME });
  y -= 40;

  // wordmark: "BC" oxford + "X" lime, then the full name
  cell(page, "BC", M, y, 22, bold, OXFORD);
  const bcW = bold.widthOfTextAtSize("BC", 22);
  cell(page, "X", M + bcW, y, 22, bold, LIME);
  cell(page, "BUILDERS CAPITAL EXCHANGE", M + bcW + bold.widthOfTextAtSize("X", 22) + 10, y + 4, 8, bold, GRAY);
  y -= 30;

  // eyebrow + name
  cell(page, "EXPENSE REPORT", M, y, 8, bold, LIME);
  y -= 18;
  cell(page, clip(bold, meta.name, 16, W), M, y, 16, bold, OXFORD);
  y -= 28;

  // meta row
  const entLabel = ENT[meta.entity] ?? meta.entity;
  const range = meta.dateFrom && meta.dateTo ? `${fmtDate(meta.dateFrom)} – ${fmtDate(meta.dateTo)}` : "";
  const metaCols: [string, string][] = [
    ["ENTITY", entLabel],
    ["RANGE", range],
    ["SUBMITTED BY", meta.submittedBy],
    ["PAYROLL PAID", meta.payrollPaid ? fmtDate(meta.payrollPaid) : "—"],
  ];
  let mx = M;
  for (const [k, v] of metaCols) {
    cell(page, k, mx, y, 7, bold, GRAY);
    cell(page, clip(font, v, 9, 120), mx, y - 13, 9, font, OXFORD);
    mx += 128;
  }
  y -= 38;

  // group expenses by trip (non-trip last)
  const groups = new Map<string, { label: string; items: ExpDb[]; sort: string }>();
  for (const e of exps) {
    const key = e.trip_id || "__none__";
    if (!groups.has(key)) {
      const t = e.trip_id ? trips.get(e.trip_id) : null;
      groups.set(key, { label: e.trip_id ? tripLabel(t) : "Non-trip", items: [], sort: t?.start_date || "9999" });
    }
    groups.get(key)!.items.push(e);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.label === "Non-trip") return 1;
    if (b.label === "Non-trip") return -1;
    return a.sort.localeCompare(b.sort);
  });

  // column layout: Date / Vendor / Traveler / Account / Doc / Amount
  const cDate = M;
  const cVendor = M + 56;
  const cTrav = M + 190;
  const cAcct = M + 290;
  const cDoc = M + 430;

  function newPageIfNeeded(rowH: number) {
    if (y < 70 + rowH) {
      page = doc.addPage([612, 792]);
      y = 792 - M;
    }
  }

  let grand = 0;
  for (const g of ordered) {
    newPageIfNeeded(40);
    // group header
    page.drawRectangle({ x: M, y: y - 4, width: W, height: 16, color: rgb(0.95, 0.97, 0.93) });
    cell(page, clip(bold, g.label, 9, W - 8), M + 4, y, 9, bold, OXFORD);
    y -= 22;
    // column headers
    cell(page, "DATE", cDate, y, 7, bold, GREEN);
    cell(page, "VENDOR", cVendor, y, 7, bold, GREEN);
    cell(page, "TRAVELER", cTrav, y, 7, bold, GREEN);
    cell(page, "ACCOUNT", cAcct, y, 7, bold, GREEN);
    cell(page, "DOC", cDoc, y, 7, bold, GREEN);
    cell(page, "AMOUNT", 0, y, 7, bold, GREEN, RIGHT);
    y -= 14;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 0.5, color: GRAY });

    let sub = 0;
    for (const e of g.items) {
      newPageIfNeeded(18);
      // CLAIM = reimbursement (full fare), not the card charge — an eCredit ticket reimburses the fare.
      const amt = e.reimbursement_amount == null || e.reimbursement_amount === "" ? num(e.amount) : num(e.reimbursement_amount);
      sub += amt;
      grand += amt;
      cell(page, clip(font, fmtMD(e.txn_date), 8, cVendor - cDate - 6), cDate, y, 8, font);
      cell(page, clip(font, payeeOf(e), 8, cTrav - cVendor - 6), cVendor, y, 8, font);
      cell(page, clip(font, e.extracted?.traveler || "", 8, cAcct - cTrav - 6), cTrav, y, 8, font);
      cell(page, clip(font, acctOf(e), 8, cDoc - cAcct - 6), cAcct, y, 8, font);
      cell(page, e.doc_url ? "receipt" : "MISSING", cDoc, y, 8, font, e.doc_url ? GREEN : RED);
      cell(page, `$${amt.toFixed(2)}`, 0, y, 8, font, OXFORD, RIGHT);
      y -= 16;
    }
    cell(page, "Subtotal", cAcct, y, 8, bold, GRAY);
    cell(page, `$${sub.toFixed(2)}`, 0, y, 8, bold, OXFORD, RIGHT);
    y -= 24;
  }

  newPageIfNeeded(24);
  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 1, color: OXFORD });
  cell(page, "Total", cAcct, y - 6, 11, bold);
  cell(page, `$${grand.toFixed(2)}`, 0, y - 6, 11, bold, OXFORD, RIGHT);

  return doc.save();
}

// ─── route ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { reportId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body when reportId is in query
  }
  const url = new URL(req.url);
  const reportId = (body.reportId ?? url.searchParams.get("reportId") ?? "").trim();
  const only = url.searchParams.get("only"); // "xlsx" | "pdf" | null (=full zip)
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: report } = await admin
    .from("expense_reports")
    .select("id, name, entity, date_from, date_to, payroll_paid_date")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const { data: rows } = await admin
    .from("payables_queue")
    .select(
      "id, txn_date, vendor, entity, account, bc_category, gl, amount, reimbursement_amount, payment_method_id, memo, doc_url, trip_id, extracted",
    )
    .eq("report_id", reportId)
    .order("txn_date", { ascending: true });
  const exps = (rows ?? []) as ExpDb[];

  // trips for grouping
  const tripIds = [...new Set(exps.map((e) => e.trip_id).filter((x): x is string => !!x))];
  const trips = new Map<string, TripDb>();
  if (tripIds.length) {
    const { data: trs } = await admin
      .from("trips")
      .select("id, dest, purpose, start_date, end_date")
      .in("id", tripIds);
    for (const t of (trs ?? []) as TripDb[]) trips.set(t.id, t);
  }

  const meta: ReportMeta = {
    name: report.name ?? "Expense report",
    entity: report.entity ?? "UNK",
    dateFrom: report.date_from ?? null,
    dateTo: report.date_to ?? null,
    submittedBy: profile.displayName || profile.email,
    payrollPaid: report.payroll_paid_date ?? null,
  };

  const base = safe(report.name || "expense_report");

  // Single-artifact downloads (from the report detail page).
  if (only === "xlsx") {
    const xlsx = buildXlsx(exps, trips);
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }
  if (only === "pdf") {
    const pdf = await buildReportPdf(meta, exps, trips);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }

  // Full package: XLSX + BCX PDF + receipts/ folder, zipped. Flips status → generated.
  const zip = new JSZip();
  try {
    zip.file(`${base}.xlsx`, buildXlsx(exps, trips));
  } catch (err) {
    console.error("[expense-reports/generate] xlsx failed:", err);
  }
  try {
    zip.file(`${base}.pdf`, await buildReportPdf(meta, exps, trips));
  } catch (err) {
    console.error("[expense-reports/generate] pdf failed:", err);
  }

  const receipts = zip.folder("receipts")!;
  let attached = 0;
  let missing = 0;
  for (const e of exps) {
    if (!e.doc_url) {
      missing += 1;
      continue;
    }
    try {
      const res = await fetch(forceDownload(e.doc_url));
      if (!res.ok) {
        missing += 1;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      receipts.file(`${safe(String(e.txn_date || ""))}_${safe(payeeOf(e))}_${num(e.amount).toFixed(2)}.pdf`, buf);
      attached += 1;
    } catch {
      missing += 1;
    }
  }

  // Mark generated. report_id is already set at selection time, so nothing to backfill there.
  await admin
    .from("expense_reports")
    .update({ status: "generated", generated_at: new Date().toISOString() })
    .eq("id", reportId);

  const blob = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(blob), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}.zip"`,
      "X-Receipts-Attached": String(attached),
      "X-Receipts-Missing": String(missing),
    },
  });
}
