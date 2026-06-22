import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Ingest@ exception report data layer.
 *
 * intake@ routes every inbound document to a pathway (payables vs travel). This surface shows the
 * ones it COULDN'T route on its own — the front-door decisions only an operator can make. Three
 * sources, all read-only here (the writes go through their own routes):
 *
 *   • needsPath  — a sender domain with no deterministic pathway rule (intake guessed). Source:
 *                  public.v_ingest_needs_path (routing_log seed-fallbacks minus already-pathed
 *                  vendors). Fixing it = add a vendor path (→ /api/ingest-exceptions/add-vendor-path).
 *   • noTrip     — a travel confirmation that matched no trip. Source: public.travel_needs_trip
 *                  (status='open'). Fixing it = assign/decline (→ /api/travel/needs-trip).
 *   • unreadable — an upload the pipeline couldn't read (e.g. image-only PDF, OCR found no text).
 *                  Source: public.ingestion_jobs (status='error'). Fixing it = retry / re-upload /
 *                  enter manually.
 *
 * Coding-stage problems (duplicates, split GL, currency holds, missing docs, receipt-vs-bill) are
 * deliberately NOT here — they belong to the payables surface, after routing.
 */

export type IngestExceptionKind = "path" | "divergence" | "trip" | "ocr" | "fetch";

export interface IngestException {
  kind: IngestExceptionKind;
  id: string;
  who: string;
  detail: string;
  // needs-path only
  domain?: string;
  guessedPipeline?: string | null;
  inconsistent?: boolean;
  // divergence only
  vendor?: string;
  // unreadable only
  source?: string | null;
  filename?: string | null;
}

export type Counts = { total: number } & Record<IngestExceptionKind, number>;

export interface IngestExceptionsData {
  items: IngestException[];
  counts: Counts;
}

function countKinds(items: IngestException[]): Counts {
  const k = (kind: IngestExceptionKind) => items.filter((i) => i.kind === kind).length;
  return { total: items.length, path: k("path"), divergence: k("divergence"), trip: k("trip"), ocr: k("ocr"), fetch: k("fetch") };
}

function fmtDates(start: string | null, end: string | null, dates: string | null): string {
  if (dates) return dates;
  if (start && end) return `${start} → ${end}`;
  return start ?? "";
}

/** Mock rows shown when Supabase isn't configured (same pattern as getTravel's MOCK fallback) so the
 *  UI is populated for local/dev runs without a DB. Mirrors the three live exception kinds. */
const MOCK: IngestException[] = [
  {
    kind: "path",
    id: "path:realestateapi.com",
    who: "Invoice 04122 — RealEstateAPI",
    detail: "realestateapi.com · 3 docs · guessed payables (no path on file)",
    domain: "realestateapi.com",
    guessedPipeline: "payables",
    inconsistent: false,
  },
  {
    kind: "path",
    id: "path:sonder.com",
    who: "Your upcoming stay — Sonder",
    detail: "sonder.com · 2 docs · routed inconsistently (no path on file)",
    domain: "sonder.com",
    guessedPipeline: "travel",
    inconsistent: true,
  },
  {
    kind: "divergence",
    id: "divergence:Enterprise",
    who: "Enterprise Rent-A-Car",
    detail: "learned as travel — now sending invoices (2) · routed to payables, confirm?",
    vendor: "Enterprise Rent-A-Car",
  },
  {
    kind: "trip",
    id: "trip:demo-national",
    who: "National Car Rental",
    detail: "Jun 29 → Jul 1 · car · matched no trip",
  },
  {
    kind: "ocr",
    id: "ocr:demo-ava",
    who: "ava-hotel-folio.pdf",
    detail: "upload · image-only PDF — OCR found no text",
    source: "upload",
    filename: "ava-hotel-folio.pdf",
  },
  {
    kind: "fetch",
    id: "fetch:demo-1",
    who: "Your statement is ready to view",
    detail: "chase.com · references a document we still need to fetch",
  },
];

export async function getIngestExceptions(): Promise<IngestExceptionsData> {
  const empty: IngestExceptionsData = { items: [], counts: countKinds([]) };
  if (!isSupabaseConfigured()) return { items: MOCK, counts: countKinds(MOCK) };
  try {
    const supabase = await createClient();
    const [pathRes, divRes, tripRes, ocrRes, fetchRes] = await Promise.all([
      supabase
        .from("v_ingest_needs_path")
        .select("domain, guessed_pipeline, n_real, n_total, distinct_pipes, sample_subject, last_seen")
        .order("n_total", { ascending: false }),
      supabase
        .from("v_ingest_divergence")
        .select("vendor, n, sample_subject, last_seen")
        .order("n", { ascending: false }),
      supabase
        .from("travel_needs_trip")
        .select("id, destination, dates, start_date, end_date, summary, source_url, doc_type")
        .eq("status", "open")
        .order("start_date", { ascending: true }),
      supabase
        .from("ingestion_jobs")
        .select("id, source, original_filename, error, created_at")
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("v_ingest_fetch_required")
        .select("id, sender, vendor, subject, ts")
        .limit(100),
    ]);

    const items: IngestException[] = [];

    for (const r of pathRes.data ?? []) {
      const real = Number(r.n_real ?? 0);
      const inconsistent = Number(r.distinct_pipes ?? 1) > 1;
      const guess = r.guessed_pipeline as string | null;
      const detail = inconsistent
        ? `${r.domain} · ${real} doc${real === 1 ? "" : "s"} · routed inconsistently (no path on file)`
        : `${r.domain} · ${real} doc${real === 1 ? "" : "s"} · guessed ${guess ?? "?"} (no path on file)`;
      items.push({
        kind: "path",
        id: `path:${r.domain}`,
        who: r.sample_subject ? String(r.sample_subject).slice(0, 60) : (r.domain as string),
        detail,
        domain: r.domain as string,
        guessedPipeline: guess,
        inconsistent,
      });
    }

    for (const r of divRes.data ?? []) {
      const n = Number(r.n ?? 0);
      items.push({
        kind: "divergence",
        id: `divergence:${r.vendor}`,
        who: r.vendor as string,
        detail: `learned as travel — now sending invoices (${n}) · routed to payables, confirm?`,
        vendor: r.vendor as string,
      });
    }

    for (const r of tripRes.data ?? []) {
      const dates = fmtDates(r.start_date, r.end_date, r.dates);
      items.push({
        kind: "trip",
        id: `trip:${r.id}`,
        who: r.destination ?? r.summary ?? "Travel confirmation",
        detail: `${dates ? dates + " · " : ""}${r.doc_type ? r.doc_type + " · " : ""}matched no trip`,
      });
    }

    for (const r of ocrRes.data ?? []) {
      items.push({
        kind: "ocr",
        id: `ocr:${r.id}`,
        who: r.original_filename ?? "Uploaded document",
        detail: `${r.source ?? "upload"} · ${r.error ?? "could not be read"}`,
        source: r.source ?? null,
        filename: r.original_filename ?? null,
      });
    }

    for (const r of fetchRes.data ?? []) {
      const dom = String(r.sender ?? "").split("@")[1] ?? r.sender ?? "";
      items.push({
        kind: "fetch",
        id: `fetch:${r.id}`,
        who: r.subject ? String(r.subject).slice(0, 60) : (r.vendor as string) ?? "Document referenced",
        detail: `${dom ? dom + " · " : ""}references a document we still need to fetch`,
        vendor: (r.vendor as string) ?? undefined,
      });
    }

    return { items, counts: countKinds(items) };
  } catch {
    return empty;
  }
}

export interface TripOption {
  id: string;
  label: string;
}

/** Open/upcoming trips the operator can attach a no-trip-match confirmation to, here in the report
 *  (reuses /api/travel/needs-trip which records assigned_trip_id → the worker drain attaches). */
export async function getTripOptions(): Promise<TripOption[]> {
  if (!isSupabaseConfigured()) {
    return [
      { id: "demo-trip-1", label: "Puyallup · Jun 28 – Jul 2" },
      { id: "demo-trip-2", label: "Seattle · Jun 30 – Jul 1" },
    ];
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("trips")
      .select("id, dest, dates, status, start_date")
      .order("start_date", { ascending: false })
      .limit(50);
    return (data ?? [])
      .filter((t) => t.status !== "archived" && t.status !== "cancelled")
      .map((t) => ({ id: t.id as string, label: `${t.dest ?? "Trip"}${t.dates ? " · " + t.dates : ""}` }));
  } catch {
    return [];
  }
}

/** Document-type options offered when adding a vendor path, keyed by pathway. */
export const DOC_TYPES_BY_PATHWAY: Record<string, string[]> = {
  payables: [
    "telecom_invoice", "utility_invoice", "saas_invoice", "insurance_invoice",
    "auto_loan_statement", "mortgage_statement", "retail_order", "other_invoice",
  ],
  travel: ["flight", "train", "hotel", "airbnb", "car", "ride", "meal", "event"],
};
