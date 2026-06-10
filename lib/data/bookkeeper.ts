/**
 * Bookkeeper posting ledger — QuickBooks Online API (OAuth) posting status.
 * Supabase `bookkeeper_ledger` with mock fallback. Mirrors the approved mockup
 * docs/mockups/bookkeeper_status.html. NOT Zapier — posting is the QBO OAuth API.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type LedgerStatus = "posted" | "ready" | "err" | "held";
export type TxnType = "Purchase" | "Bill" | "Deposit" | "Check";

export interface Leg {
  file: string;
  act: string;
  amount: number;
}

export interface LedgerRow {
  id: string;
  status: LedgerStatus;
  vendor: string;
  memo: string;
  type: TxnType;
  /** QuickBooks company file the txn posts to. */
  file: string;
  sub: string;
  amount: number;
  ref: string;
  gap?: boolean;
  legs?: Leg[];
  balnote?: string;
  err?: string;
}

const MOCK: LedgerRow[] = [
  { id: "1", status: "posted", vendor: "Travel 2026-06 — Builders Capital · Denver (6/4–6/7)", memo: "Delta Air Lines · airfare", type: "Purchase", file: "Jacob Wolbach (PER)", sub: "AMEX Delta ••5001", amount: 410.0, ref: "QB Txn #1071" },
  {
    id: "2", status: "posted", vendor: "Home Depot", memo: "Lumber & framing + power tools (split)", type: "Purchase", file: "WJW Investments Idaho", sub: "intercompany", amount: 287.43, ref: "QB Txn #1072",
    legs: [
      { file: "Jacob Wolbach (PER) — Purchase", act: "Cr AMEX ••1004 · Dr Loans Receivable — WJW", amount: 287.43 },
      { file: "WJW Investments — Bill", act: "Dr 6120 Materials / 6140 Tools · Cr Expenses Payable — Jacob Wolbach", amount: 287.43 },
    ],
  },
  { id: "3", status: "posted", vendor: "Quantum Fiber", memo: "Internet — June", type: "Purchase", file: "Foundry Capital LLC", sub: "AMEX Foundry ••1005", amount: 120.0, ref: "QB Txn #1073", gap: true },
  { id: "4", status: "posted", vendor: "Data Engine, LLC", memo: "RealEstateAPI subscription", type: "Purchase", file: "Jacob Wolbach (PER)", sub: "BC — balance sheet (Loan - Builders Capital)", amount: 616.97, ref: "QB Txn #1074" },
  { id: "5", status: "posted", vendor: "Paylocity reimbursement", memo: "BC expense reimbursement received", type: "Deposit", file: "Jacob Wolbach (PER)", sub: "clears Loan - Builders Capital", amount: 540.0, ref: "QB Txn #1070" },
  { id: "6", status: "ready", vendor: "St Ignatius School", memo: "Tuition autopay", type: "Bill", file: "Jacob Wolbach (PER)", sub: "auto-approved · staged for this cycle", amount: 425.0, ref: "ready" },
  { id: "8", status: "ready", vendor: "Adobe", memo: "Creative Cloud — monthly", type: "Purchase", file: "Foundry Capital LLC", sub: "auto-approved · known vendor", amount: 59.99, ref: "ready" },
  {
    id: "9", status: "ready", vendor: "Selkirk Management", memo: "Office supplies (intercompany)", type: "Purchase", file: "Selkirk Management LLC", sub: "auto-approved · intercompany", amount: 142.1, ref: "ready",
    legs: [
      { file: "Jacob Wolbach (PER) — Purchase", act: "Cr AMEX ••1004 · Dr Loans Receivable — Selkirk", amount: 142.1 },
      { file: "Selkirk Management — Bill", act: "Dr 6900 Office / Admin · Cr Expenses Payable — Jacob Wolbach", amount: 142.1 },
    ],
    balnote: "Nets to $0 across the books — funded by Personal (PER), tracked as Loans Receivable until settled (50/50 partnership entity).",
  },
  { id: "7", status: "err", vendor: "The Clean-Up Crew", memo: "Cleaning services · invoice 690", type: "Bill", file: "Builders Capital", sub: "vendor not found in QB file", amount: 540.0, ref: "not posted", gap: true, err: "Vendor “The Clean-Up Crew” does not exist in the Builders Capital QuickBooks file. Create the vendor or remap, then retry." },
];

export async function getLedger(): Promise<LedgerRow[]> {
  if (!isSupabaseConfigured()) return MOCK;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("bookkeeper_ledger").select("*").order("ord");
    if (error || !data || data.length === 0) return MOCK;
    return data.map((r): LedgerRow => ({
      id: r.id,
      status: r.status,
      vendor: r.vendor,
      memo: r.memo ?? "",
      type: r.type,
      file: r.file ?? "",
      sub: r.sub ?? "",
      amount: Number(r.amount),
      ref: r.ref ?? "",
      gap: r.gap ?? false,
      legs: r.legs
        ? (r.legs as Leg[]).map((l) => ({ ...l, amount: Number(l.amount) }))
        : undefined,
      balnote: r.balnote ?? undefined,
      err: r.err ?? undefined,
    }));
  } catch {
    return MOCK;
  }
}
