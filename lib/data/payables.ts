/**
 * Payables exception-queue data.
 *
 * Queries the Supabase `payables_queue` table when the backend is configured;
 * otherwise (or on any error / empty result) returns mock data so the screen
 * stays usable. Same defensive pattern as lib/data/agents.ts. The mock mirrors
 * the approved mockup in docs/mockups/payables_exceptions.html.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Posting = "bill" | "charge";
export type ExceptionType = "entity" | "vendor" | "split" | "dup";

export interface PayableLine {
  desc: string;
  amount: number;
  gl: string;
}

export interface PayableRow {
  id: string;
  vendor: string;          // QB posting name (trip name for travel)
  vendorDisplay?: string;  // real merchant shown in the app (Delta, Hilton, …)
  sub: string;
  amount: number;
  posting: Posting;
  account: string;
  /** Entity code (BC/FC/PER/WJW) or null when unresolved. */
  entity: string | null;
  /** Agent's recommended entity code, if any. */
  recommended?: string | null;
  exception?: ExceptionType;
  reason?: string;
  category?: string;
  lines?: PayableLine[];
  gl?: string;
  auto?: boolean;
  /** True when posted/coded but no receipt is attached. */
  nodoc?: boolean;
  /** Link to the filed source document (Dropbox share link). */
  docUrl?: string | null;
  /** Resolved payment method id (matches a PayAccount.id) — drives Pay-from default. */
  paymentMethodId?: string | null;
  /** Lifecycle: open | approved (staged for QBO) | posted. */
  status?: string | null;
  /** Structured vendor contact (from vendor_master / the invoice) — prefills the Learn-vendor modal. */
  vendorContact?: {
    street?: string; city?: string; state?: string; zip?: string;
    phone?: string; email?: string; website?: string; account_number?: string;
  } | null;
  /** accepted (operator-confirmed / curated) | on_file (in vendor_master, unconfirmed) | new. */
  vendorStatus?: string | null;
  /** QBO memo (computed at ingest, operator-editable) — shown in queue + drawer, posted to QB. */
  memo?: string | null;
  /** Invoice number (operator-editable) → posted to the QB invoice-number field (DocNumber). */
  invoiceNumber?: string | null;
  /** Transaction (invoice/service) date YYYY-MM-DD (operator-editable) → posted as QB TxnDate. */
  txnDate?: string | null;
  /** Identified document type (e.g. utility_statement). Operator can correct → re-run + learn. */
  docType?: string | null;
  /** Attributed trip id (when this is a trip expense) — drives the drawer trip picker. */
  tripId?: string | null;
  /** This vendor's saved multi-line split layout (entity+account+amount per line), if any.
   *  The drawer offers a one-click "Apply saved split"; NOT auto-applied (split = exception). */
  lineTemplate?: { entity: string | null; gl: string | null; amount?: number; bcCategory?: string }[] | null;
}

const MOCK: PayableRow[] = [
  {
    id: "1",
    exception: "entity",
    vendor: "The Clean-Up Crew",
    sub: "Invoice 690 · Jun 8",
    amount: 540.0,
    posting: "bill",
    account: "unpaid · due Jun 20",
    entity: null,
    recommended: "BC",
    reason: "No entity detected from invoice content",
    lines: [{ desc: "Cleaning services", amount: 540, gl: "6300 Repairs & Maint" }],
  },
  {
    id: "2",
    exception: "vendor",
    vendor: "Data Engine, LLC",
    sub: "billing@dataengine.io · Jun 9",
    amount: 616.97,
    posting: "charge",
    account: "AMEX WJW ••1004",
    entity: "BC",
    recommended: "BC",
    reason: "Unrecognized sender — new vendor",
    category: "Software / Data",
    lines: [{ desc: "RealEstateAPI subscription", amount: 616.97, gl: "6200 Software" }],
  },
  {
    id: "10",
    exception: "vendor",
    vendor: "Data Engine, LLC",
    sub: "billing@dataengine.io · May 9",
    amount: 616.97,
    posting: "charge",
    account: "AMEX WJW ••1004",
    entity: "BC",
    recommended: "BC",
    reason: "Unrecognized sender — new vendor",
    category: "Software / Data",
    lines: [{ desc: "RealEstateAPI subscription", amount: 616.97, gl: "6200 Software" }],
  },
  {
    id: "3",
    exception: "split",
    vendor: "Home Depot",
    sub: "Order #426182812 · Jun 7",
    amount: 287.43,
    posting: "charge",
    account: "AMEX WJW ••1004",
    entity: "WJW",
    recommended: null,
    reason: "Split across line items — confirm coding",
    lines: [
      { desc: "Lumber & framing", amount: 180.0, gl: "6120 Materials (WJW)" },
      { desc: "Power tools", amount: 107.43, gl: "6140 Sm Tools (WJW)" },
    ],
  },
  {
    id: "4",
    exception: "dup",
    vendor: "St Ignatius School",
    sub: "Automatic payment · Jun 6",
    amount: 425.0,
    posting: "bill",
    account: "Wells Fargo Checking",
    entity: "PER",
    recommended: null,
    reason: "Looks like a duplicate of a May 6 charge",
    lines: [{ desc: "Tuition autopay", amount: 425.0, gl: "7800 Personal" }],
  },
  {
    id: "9",
    exception: "entity",
    vendor: "Percy's Restaurant",
    sub: "Jun 12 · Dining · 🚫 no trip on these dates",
    amount: 78.5,
    posting: "charge",
    account: "AMEX WJW ••1004",
    entity: null,
    recommended: "PER",
    nodoc: true,
    reason: "A meal, but it's not inside any trip window — so it's a normal payable, not a trip expense",
    lines: [{ desc: "Dinner", amount: 78.5, gl: "7800 Meals (PER)" }],
  },
  // auto-coded
  { id: "5", auto: true, vendor: "Dropbox", sub: "Business plan renewal", amount: 96.0, posting: "charge", account: "AMEX Foundry ••1005", entity: "FC", gl: "6200 Software" },
  { id: "6", auto: true, nodoc: true, vendor: "Quantum Fiber", sub: "Internet — June · from CSV", amount: 120.0, posting: "charge", account: "AMEX Foundry ••1005", entity: "FC", gl: "6420 Internet" },
  { id: "7", auto: true, nodoc: true, vendor: "Apple", sub: "iCloud+ · from CSV", amount: 2.99, posting: "charge", account: "AMEX Delta ••5001", entity: "PER", gl: "7800 Personal" },
  { id: "8", auto: true, vendor: "Adobe", sub: "Creative Cloud", amount: 59.99, posting: "charge", account: "AMEX Foundry ••1005", entity: "FC", gl: "6200 Software" },
];

/**
 * The known vendor universe for the drawer's "change vendor" typeahead: our canonical
 * `vendors` master + every entity's live QuickBooks vendor list (`vendor_qbo_refs`),
 * deduped + sorted. Lets the operator re-point a charge to an EXISTING vendor instead of
 * only free-text Learn/Add. Defensive: returns [] (typeahead just shows nothing) on any error.
 */
export async function getVendors(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const [{ data: master }, { data: qb }] = await Promise.all([
      supabase.from("vendors").select("canonical_name"),
      supabase.from("vendor_qbo_refs").select("display_name").eq("active", true),
    ]);
    const names = new Set<string>();
    for (const v of master ?? []) if (v.canonical_name) names.add(String(v.canonical_name).trim());
    for (const v of qb ?? []) if (v.display_name) names.add(String(v.display_name).trim());
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export interface TripOption {
  tripId: string;
  header: string;
  entity: string | null;
  dates: string;
}

/**
 * Trips for the drawer's trip re-attribution picker. Reads `payables_trips`, which the
 * backend syncs from the canonical trip source WITH the locked `build_trip_header_subject`
 * header precomputed — so the portal never re-implements the trip name (drift-proof).
 */
export async function getTrips(): Promise<TripOption[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("payables_trips")
      .select("trip_id, header, entity, dates")
      .order("start_date", { ascending: false });
    return (data ?? []).map((t) => ({
      tripId: t.trip_id,
      header: t.header,
      entity: t.entity ?? null,
      dates: t.dates ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getPayablesQueue(): Promise<PayableRow[]> {
  if (!isSupabaseConfigured()) return MOCK;
  try {
    const supabase = await createClient();
    // Payables is the coding queue: only rows still being coded (status open or
    // null). Once approved/posted they hand off to the Bookkeeper; discarded are
    // gone. So the queue shows only un-posted work.
    // open/null = active coding queue. 'reclassified' rows (sent to Travel) are ALSO
    // loaded so the operator can recover them (they render resolved, with a "Back to
    // review" action) — a reclassify must never make a row un-findable.
    const { data, error } = await supabase
      .from("payables_queue")
      .select("*")
      .or("status.is.null,status.eq.open,status.eq.reclassified")
      .order("ord");
    if (error || !data) return MOCK;
    const rows = data.map((r): PayableRow => ({
      id: r.id,
      vendor: r.vendor,
      vendorDisplay: r.vendor_display ?? r.vendor,
      sub: r.sub ?? "",
      amount: Number(r.amount),
      posting: r.posting,
      account: r.account ?? "",
      entity: r.entity ?? null,
      recommended: r.recommended ?? null,
      exception: r.exception ?? undefined,
      reason: r.reason ?? undefined,
      category: r.category ?? undefined,
      lines: r.lines ?? undefined,
      gl: r.gl ?? undefined,
      auto: r.auto ?? false,
      nodoc: r.nodoc ?? false,
      docUrl: r.doc_url ?? null,
      paymentMethodId: r.payment_method_id ?? null,
      status: r.status ?? "open",
      vendorContact: r.vendor_contact ?? null,
      vendorStatus: r.vendor_status ?? "new",
      memo: r.memo ?? null,
      invoiceNumber: r.invoice_number ?? null,
      txnDate: r.txn_date ?? null,
      docType: r.doc_type ?? null,
      tripId: r.trip_id ?? null,
    }));
    // Attach each vendor's saved multi-line split layout (if any), so the drawer can offer
    // a one-click "Apply saved split". NOT auto-applied — a split is the exception, not the
    // rule, for most vendors (Jacob).
    try {
      const vendors = [...new Set(rows.map((r) => r.vendor).filter(Boolean))];
      if (vendors.length) {
        const { data: tmpls } = await supabase
          .from("vendor_line_templates")
          .select("vendor, lines")
          .in("vendor", vendors);
        const byVendor = new Map((tmpls ?? []).map((t) => [String(t.vendor).toLowerCase(), t.lines]));
        for (const r of rows) {
          const t = byVendor.get((r.vendor ?? "").toLowerCase());
          if (Array.isArray(t) && t.length >= 2) r.lineTemplate = t;
        }
      }
    } catch {
      /* best-effort — the saved-split button just won't show */
    }
    return rows;
  } catch {
    return MOCK;
  }
}

export interface DocTypeOption { docType: string; label: string; category: string }

/** All document types (for the per-row "correct the identified type" picker). */
export async function getDocTypes(): Promise<DocTypeOption[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("doc_types")
      .select("doc_type, display_name, category")
      .order("display_name");
    return (data ?? []).map((r) => ({
      docType: r.doc_type as string,
      label: (r.display_name as string) || (r.doc_type as string),
      category: (r.category as string) || "Other",
    }));
  } catch {
    return [];
  }
}
