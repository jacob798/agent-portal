/**
 * Expense Reports data.
 *
 * SOURCE OF TRUTH is `payables_queue` — an expense is "on a report" when its
 * `report_id` is set, and "unexpensed" when `report_id IS NULL`. The
 * `expense_reports` table is just the report header (name/entity/range/status +
 * the reconcile timestamps). Mirrors lib/data/payables.ts: queries Supabase when
 * configured, otherwise returns mock data so the screens stay usable.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
// Types + pure helpers live in a client-safe module (no server imports). Re-exported here so
// existing server importers (pages, routes) keep importing them from "@/lib/data/expenseReports".
import type { ReportStatus, ExpenseReport, TripRef, ReconcileData, ExpenseRow } from "./expenseReportsShared";
export * from "./expenseReportsShared";

// ─── mocks ───────────────────────────────────────────────────────────────────

const MOCK_REPORTS: ExpenseReport[] = [
  {
    id: "er_mock1",
    name: "Builders Capital — June travel",
    entity: "BC",
    status: "submitted",
    dateFrom: "2026-06-01",
    dateTo: "2026-06-30",
    note: null,
    payrollPaidDate: null,
    createdAt: "2026-06-15T12:00:00Z",
    generatedAt: "2026-06-16T12:00:00Z",
    submittedAt: "2026-06-16T13:00:00Z",
    reimbursedAt: null,
    itemCount: 6,
    total: 3284.51,
    ecreditApplied: 0,
  },
  {
    id: "er_mock2",
    name: "WJW — May site visits",
    entity: "WJW",
    status: "reimbursed",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-31",
    note: null,
    payrollPaidDate: "2026-06-05",
    createdAt: "2026-05-28T12:00:00Z",
    generatedAt: "2026-05-29T12:00:00Z",
    submittedAt: "2026-05-29T13:00:00Z",
    reimbursedAt: "2026-06-05T13:00:00Z",
    itemCount: 4,
    total: 1842.0,
    ecreditApplied: 0,
  },
  {
    id: "er_mock3",
    name: "Builders Capital — July (draft)",
    entity: "BC",
    status: "draft",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    note: "Collecting receipts",
    payrollPaidDate: null,
    createdAt: "2026-06-18T12:00:00Z",
    generatedAt: null,
    submittedAt: null,
    reimbursedAt: null,
    itemCount: 0,
    total: 0,
    ecreditApplied: 0,
  },
];

const MOCK_EXPENSES: ExpenseRow[] = [
  {
    id: "exp_m1",
    date: "2026-06-08",
    payee: "Delta Air Lines",
    entityCode: "BC",
    traveler: "Jacob Wolbach",
    tripName: { destination: "Minneapolis", purpose: "Lender meetings", start: "2026-06-08", end: "2026-06-10" },
    account: "Travel : General",
    amount: 612.4,
    reimbursementAmount: 612.4,
    docUrl: null,
    paymentMethod: "AMEX Delta ••5001",
    memo: null,
    creditAmount: null,
    creditNumber: null,
    reconcile: { reimbursed: null, varianceEntity: null },
  },
  {
    id: "exp_m2",
    date: "2026-06-08",
    payee: "Hyatt Regency",
    entityCode: "BC",
    traveler: "Jacob Wolbach",
    tripName: { destination: "Minneapolis", purpose: "Lender meetings", start: "2026-06-08", end: "2026-06-10" },
    account: "Travel : General",
    amount: 428.0,
    reimbursementAmount: 428.0,
    docUrl: null,
    paymentMethod: "AMEX Delta ••5001",
    memo: null,
    creditAmount: null,
    creditNumber: null,
    reconcile: { reimbursed: null, varianceEntity: null },
  },
  {
    id: "exp_m3",
    date: "2026-06-09",
    payee: "Manny's Steakhouse",
    entityCode: "BC",
    traveler: "Jacob Wolbach",
    tripName: { destination: "Minneapolis", purpose: "Lender meetings", start: "2026-06-08", end: "2026-06-10" },
    account: "Meals - General",
    amount: 142.11,
    reimbursementAmount: 142.11,
    docUrl: null,
    paymentMethod: "AMEX Delta ••5001",
    memo: null,
    creditAmount: null,
    creditNumber: null,
    reconcile: { reimbursed: null, varianceEntity: null },
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface ReportRowDb {
  id: string;
  name: string | null;
  entity: string | null;
  status: string | null;
  date_from: string | null;
  date_to: string | null;
  note: string | null;
  payroll_paid_date: string | null;
  created_at: string | null;
  generated_at: string | null;
  submitted_at: string | null;
  reimbursed_at: string | null;
}

function mapReport(r: ReportRowDb, itemCount = 0, total = 0, ecreditApplied = 0): ExpenseReport {
  const status = (["draft", "generated", "submitted", "reimbursed"].includes(r.status ?? "")
    ? r.status
    : "draft") as ReportStatus;
  return {
    id: r.id,
    name: r.name ?? "Untitled report",
    entity: r.entity ?? "UNK",
    status,
    dateFrom: r.date_from ?? null,
    dateTo: r.date_to ?? null,
    note: r.note ?? null,
    payrollPaidDate: r.payroll_paid_date ?? null,
    createdAt: r.created_at ?? null,
    generatedAt: r.generated_at ?? null,
    submittedAt: r.submitted_at ?? null,
    reimbursedAt: r.reimbursed_at ?? null,
    itemCount,
    total,
    ecreditApplied,
  };
}

interface PayableExpenseDb {
  id: string;
  txn_date: string | null;
  vendor: string | null;
  entity: string | null;
  account: string | null;
  bc_category: string | null;
  gl: string | null;
  amount: number | string | null;
  reimbursement_amount: number | string | null;
  doc_url: string | null;
  payment_method_id: string | null;
  memo: string | null;
  trip_id: string | null;
  extracted: {
    payee?: string;
    traveler?: string;
    credit_number?: string | null;
    credit_amount?: number | string | null;
    recon?: { reimbursed?: number | null; variance_entity?: string | null };
  } | null;
}

type TripMap = Map<string, TripRef>;

function mapExpense(r: PayableExpenseDb, trips: TripMap): ExpenseRow {
  const ex = r.extracted ?? {};
  const recon = ex.recon ?? {};
  return {
    id: r.id,
    date: r.txn_date ?? null,
    payee: ex.payee || r.vendor || "—",
    entityCode: r.entity ?? null,
    traveler: ex.traveler ?? null,
    tripName: r.trip_id ? trips.get(r.trip_id) ?? null : null,
    account: r.bc_category || r.gl || r.account || "",
    amount: num(r.amount),
    reimbursementAmount:
      r.reimbursement_amount === null || r.reimbursement_amount === undefined || r.reimbursement_amount === ""
        ? null
        : num(r.reimbursement_amount),
    docUrl: r.doc_url ?? null,
    paymentMethod: r.account || r.payment_method_id || null,
    memo: r.memo ?? null,
    creditAmount: ex.credit_amount === null || ex.credit_amount === undefined || ex.credit_amount === "" ? null : num(ex.credit_amount),
    creditNumber: ex.credit_number ?? null,
    reconcile: {
      reimbursed: recon.reimbursed === undefined ? null : recon.reimbursed,
      varianceEntity: recon.variance_entity ?? null,
    },
  };
}

const EXP_COLS =
  "id, txn_date, vendor, entity, account, bc_category, gl, amount, reimbursement_amount, doc_url, payment_method_id, memo, trip_id, extracted";

/** Load the trips referenced by a set of rows into a destination/purpose/date map. */
async function loadTrips(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripIds: (string | null)[],
): Promise<TripMap> {
  const ids = [...new Set(tripIds.filter((x): x is string => !!x))];
  const map: TripMap = new Map();
  if (!ids.length) return map;
  const { data } = await supabase
    .from("trips")
    .select("id, dest, purpose, start_date, end_date")
    .in("id", ids);
  for (const t of data ?? []) {
    map.set(t.id, {
      destination: t.dest ?? null,
      purpose: t.purpose ?? null,
      start: t.start_date ?? null,
      end: t.end_date ?? null,
    });
  }
  return map;
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function getExpenseReports(): Promise<ExpenseReport[]> {
  if (!isSupabaseConfigured()) return MOCK_REPORTS;
  try {
    const supabase = await createClient();
    const { data: reports, error } = await supabase
      .from("expense_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !reports) return MOCK_REPORTS;

    // One pass over the line items to compute count + total per report_id. The report TOTAL is the
    // CLAIM (reimbursement = full fare), not the card charge — an eCredit ticket claims the full fare.
    const { data: items } = await supabase
      .from("payables_queue")
      .select("report_id, amount, reimbursement_amount, extracted")
      .not("report_id", "is", null);
    const counts = new Map<string, { n: number; sum: number; ec: number }>();
    for (const it of items ?? []) {
      const rid = it.report_id as string;
      const cur = counts.get(rid) ?? { n: 0, sum: 0, ec: 0 };
      cur.n += 1;
      cur.sum += it.reimbursement_amount == null || it.reimbursement_amount === "" ? num(it.amount) : num(it.reimbursement_amount);
      const ca = (it.extracted as { credit_amount?: number | string | null } | null)?.credit_amount;
      cur.ec += ca == null || ca === "" ? 0 : num(ca);
      counts.set(rid, cur);
    }
    return (reports as ReportRowDb[]).map((r) => {
      const c = counts.get(r.id) ?? { n: 0, sum: 0, ec: 0 };
      return mapReport(r, c.n, c.sum, c.ec);
    });
  } catch {
    return MOCK_REPORTS;
  }
}

export async function getExpenseReport(id: string): Promise<ExpenseReport | null> {
  if (!isSupabaseConfigured()) return MOCK_REPORTS.find((r) => r.id === id) ?? null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("expense_reports").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    const { data: items } = await supabase
      .from("payables_queue")
      .select("amount, reimbursement_amount, extracted")
      .eq("report_id", id);
    const n = items?.length ?? 0;
    const sum = (items ?? []).reduce((a, it) => a + (it.reimbursement_amount == null || it.reimbursement_amount === "" ? num(it.amount) : num(it.reimbursement_amount)), 0);
    const ec = (items ?? []).reduce((a, it) => {
      const ca = (it.extracted as { credit_amount?: number | string | null } | null)?.credit_amount;
      return a + (ca == null || ca === "" ? 0 : num(ca));
    }, 0);
    return mapReport(data as ReportRowDb, n, sum, ec);
  } catch {
    return null;
  }
}

/** Unexpensed payables for an entity within a date window — the selection pool. */
export async function getUnexpensedExpenses(
  entityCode: string,
  fromISO: string,
  toISO: string,
): Promise<ExpenseRow[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_EXPENSES.filter((e) => e.entityCode === entityCode);
  }
  try {
    const supabase = await createClient();
    let q = supabase
      .from("payables_queue")
      .select(EXP_COLS)
      .eq("entity", entityCode)
      .is("report_id", null);
    if (fromISO) q = q.gte("txn_date", fromISO);
    if (toISO) q = q.lte("txn_date", toISO);
    const { data, error } = await q.order("txn_date", { ascending: true });
    if (error || !data) return [];
    const rows = data as PayableExpenseDb[];
    const trips = await loadTrips(supabase, rows.map((r) => r.trip_id));
    return rows.map((r) => mapExpense(r, trips));
  } catch {
    return [];
  }
}

/** The expenses ON a report (report_id = reportId). */
export async function getReportExpenses(reportId: string): Promise<ExpenseRow[]> {
  if (!isSupabaseConfigured()) {
    return reportId === "er_mock1" ? MOCK_EXPENSES : [];
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payables_queue")
      .select(EXP_COLS)
      .eq("report_id", reportId)
      .order("txn_date", { ascending: true });
    if (error || !data) return [];
    const rows = data as PayableExpenseDb[];
    const trips = await loadTrips(supabase, rows.map((r) => r.trip_id));
    return rows.map((r) => mapExpense(r, trips));
  } catch {
    return [];
  }
}
