/**
 * Builders Capital employer-reimbursement workspace.
 * Supabase `bc_reimbursement` with mock fallback. Mirrors the approved mockup
 * docs/mockups/bc_reimbursement.html. BC expenses post to PER QB as
 * Loan – Builders Capital (balance sheet), cleared by the Paylocity deposit.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface BcExpense {
  id: string;
  grp: "travel" | "non";
  ic: string;
  vendor: string;
  sub: string;
  gl: string;
  glsub: string;
  amount: number;
  receipt: boolean;
  included: boolean;
}

const MOCK: BcExpense[] = [
  { id: "den", grp: "travel", ic: "🧳", vendor: "Denver site visit", sub: "Jun 4–7 · 7 receipts", gl: "Travel (Airfare/Lodging/Meals/Ground)", glsub: "trip rollup", amount: 1403.02, receipt: true, included: true },
  { id: "de", grp: "non", ic: "💻", vendor: "Data Engine, LLC", sub: "RealEstateAPI subscription · Jun 9", gl: "6200 Software", glsub: "AMEX WJW ••1004", amount: 616.97, receipt: true, included: true },
  { id: "cc", grp: "non", ic: "🧹", vendor: "The Clean-Up Crew", sub: "Office cleaning · invoice 690 · Jun 8", gl: "6300 Repairs & Maint", glsub: "Bill", amount: 540.0, receipt: true, included: true },
  { id: "st", grp: "non", ic: "🖇️", vendor: "Staples", sub: "Office supplies · Jun 5 · from CSV", gl: "6900 Office / Admin", glsub: "AMEX WJW ••1004", amount: 86.4, receipt: false, included: true },
];

export interface BcHistory {
  period: string;
  status: "done";
  detail: string;
  amount: number;
}

export const BC_HISTORY: BcHistory[] = [
  { period: "May 2026", status: "done", detail: "Submitted May 31 · paid Jun 5 — Deposit cleared Loan – Builders Capital in Personal QB", amount: 2110.4 },
  { period: "April 2026", status: "done", detail: "Submitted Apr 30 · paid May 6 — cleared on the balance sheet", amount: 1884.1 },
];

export async function getBcReimbursement(): Promise<BcExpense[]> {
  if (!isSupabaseConfigured()) return MOCK;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("bc_reimbursement").select("*");
    if (error || !data || data.length === 0) return MOCK;
    return data as BcExpense[];
  } catch {
    return MOCK;
  }
}
