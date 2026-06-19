import { NextRequest, NextResponse } from "next/server";
import { applyReconcile, type ReconcileBody } from "../reconcile";

/**
 * Save reconcile progress: store the payroll-paid date on the report and merge each line's
 * {reimbursed, variance_entity} into that payables row's extracted.recon. Status stays
 * 'submitted' (this is a save, not the final reimbursement record).
 */
export async function POST(req: NextRequest) {
  let b: ReconcileBody;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  return applyReconcile(b, { markReimbursed: false });
}
