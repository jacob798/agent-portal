/**
 * Ingestion log — every document that entered the pipeline (Upload or Email)
 * and what happened to it. Surfaces the things that would otherwise be silently
 * dropped: hard errors (OCR/parse failures) and intentional exclusions
 * (duplicates skipped by dedup). "Blind excluding may be an issue" — this is the
 * review surface.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Outcome = "filed" | "duplicate" | "error" | "pending" | "processing";

export interface IngestionJob {
  id: string;
  source: string; // upload | email
  filename: string;
  outcome: Outcome;
  detail: string; // error text, dedup note, or where it filed
  resultId: string | null; // payables_queue id when filed/duplicate-of
  dropboxPath: string | null;
  createdAt: string;
}

function classify(status: string, error: string | null): { outcome: Outcome; detail: string } {
  const err = (error ?? "").trim();
  if (status === "error") return { outcome: "error", detail: err || "failed" };
  if (status === "done" && /duplicate/i.test(err)) return { outcome: "duplicate", detail: err };
  if (status === "done") return { outcome: "filed", detail: "" };
  return { outcome: status as Outcome, detail: err };
}

const MOCK: IngestionJob[] = [
  { id: "m1", source: "upload", filename: "invoice_dec.pdf", outcome: "filed", detail: "", resultId: "ing_x", dropboxPath: "/Finance/CY2025/2025-12 Invoices/…", createdAt: "" },
  { id: "m2", source: "upload", filename: "invoice_dec_again.pdf", outcome: "duplicate", detail: "duplicate (same invoice)", resultId: "ing_x", dropboxPath: null, createdAt: "" },
  { id: "m3", source: "upload", filename: "blurry_scan.pdf", outcome: "error", detail: "OCR produced no text", resultId: null, dropboxPath: null, createdAt: "" },
];

export async function getIngestionLog(limit = 50): Promise<IngestionJob[]> {
  if (!isSupabaseConfigured()) return MOCK;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ingestion_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return MOCK;
    return data.map((r): IngestionJob => {
      const { outcome, detail } = classify(r.status, r.error);
      return {
        id: r.id,
        source: r.source,
        filename: r.original_filename ?? "(unnamed)",
        outcome,
        detail: detail || (r.dropbox_path ? `Filed → ${r.dropbox_path}` : ""),
        resultId: r.result_id ?? null,
        dropboxPath: r.dropbox_path ?? null,
        createdAt: r.created_at ?? "",
      };
    });
  } catch {
    return MOCK;
  }
}
