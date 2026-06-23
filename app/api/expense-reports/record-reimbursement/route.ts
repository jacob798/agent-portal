import { NextRequest, NextResponse } from "next/server";
import { applyReconcile, type ReconcileBody } from "../reconcile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Record the reimbursement: same persistence as save-reconcile (payroll-paid date + per-line
 * recon) PLUS flip the report to status 'reimbursed'. Posting the variance to the entity's
 * QuickBooks is a backend phase handled elsewhere — we only persist here.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("expense-reports");
  if (_gate.error) return _gate.error;
  let b: ReconcileBody;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  // TODO(backend): post the variance amount to the chosen entity's QuickBooks as a Business
  // Expense and clear the BC loan. Out of scope for the portal route — persist only.
  return applyReconcile(b, { markReimbursed: true });
}
