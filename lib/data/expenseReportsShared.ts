/**
 * Expense Reports — CLIENT-SAFE types + pure display/derive helpers.
 *
 * No server imports here (no @/lib/supabase/server), so client components can import
 * types and formatters without dragging the server Supabase client (next/headers) into
 * the browser bundle. The server data functions live in `expenseReports.ts`, which
 * re-exports everything in this file.
 */

export type ReportStatus = "draft" | "generated" | "submitted" | "reimbursed";

export interface ExpenseReport {
  id: string;
  name: string;
  entity: string; // entity CODE (BC / WJW / …)
  status: ReportStatus;
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null;
  note: string | null;
  payrollPaidDate: string | null;
  createdAt: string | null;
  generatedAt: string | null;
  submittedAt: string | null;
  reimbursedAt: string | null;
  /** Number of payables rows whose report_id = this report. */
  itemCount: number;
  /** Sum of those rows' CLAIM (reimbursement, else amount). */
  total: number;
  /** Sum of eCredits applied across the report's rows (not previously expensed → still claimed). */
  ecreditApplied: number;
}

export interface TripRef {
  destination: string | null;
  purpose: string | null;
  start: string | null;
  end: string | null;
}

export interface ReconcileData {
  reimbursed: number | null;
  varianceEntity: string | null;
}

export interface ExpenseRow {
  id: string;
  date: string | null; // txn_date YYYY-MM-DD
  payee: string;
  entityCode: string | null;
  traveler: string | null;
  tripName: TripRef | null;
  account: string; // bc_category (BC) else gl
  amount: number;
  reimbursementAmount: number | null;
  /** Ticket # for a travel expense = the invoice number (QB DocNumber). */
  invoiceNumber: string | null;
  docUrl: string | null;
  paymentMethod: string | null;
  memo: string | null;
  /** eCredit applied to this ticket (the part NOT charged to the card), and its full number. */
  creditAmount: number | null;
  creditNumber: string | null;
  reconcile: ReconcileData;
}

/** MM/DD/YYYY from a YYYY-MM-DD string (date-only, no timezone shift). */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** MM/DD from a YYYY-MM-DD string. */
export function fmtMD(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}`;
}

/** "MM/DD-MM/DD" range. */
export function fmtRange(from?: string | null, to?: string | null): string {
  const a = fmtMD(from);
  const b = fmtMD(to);
  if (a && b) return `${a}-${b}`;
  return a || b || "";
}

/** Trip one-liner: "Destination · Purpose · MM/DD-MM/DD". */
export function tripLabel(t?: TripRef | null): string {
  if (!t) return "";
  const parts = [t.destination, t.purpose].filter(Boolean) as string[];
  const range = fmtRange(t.start, t.end);
  if (range) parts.push(range);
  return parts.join(" · ");
}

/** Requested (claimable) amount for a row: reimbursementAmount, else amount. */
export function requestedAmount(e: ExpenseRow): number {
  return e.reimbursementAmount ?? e.amount;
}

/** An eCredit was applied that wasn't previously expensed → the full fare is still claimed, not
 * duplicated. Returns {amount, number} for the callout, else null. */
export function ecreditNote(e: ExpenseRow): { amount: number; number: string | null } | null {
  const amt = e.creditAmount ?? 0;
  return amt > 0 ? { amount: amt, number: e.creditNumber } : null;
}
