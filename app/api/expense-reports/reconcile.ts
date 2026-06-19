import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

export interface ReconcileLine {
  id: string;
  reimbursed?: number;
  varianceEntity?: string;
}

export interface ReconcileBody {
  reportId?: string;
  payrollPaidDate?: string;
  lines?: ReconcileLine[];
}

/**
 * Shared reconcile persistence for save-reconcile + record-reimbursement.
 *   - set expense_reports.payroll_paid_date
 *   - merge extracted.recon = {reimbursed, variance_entity} onto each payables row
 *   - optionally flip the report to 'reimbursed'
 */
export async function applyReconcile(
  b: ReconcileBody,
  opts: { markReimbursed: boolean },
): Promise<NextResponse> {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  const reportId = (b.reportId ?? "").trim();
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  const lines = Array.isArray(b.lines) ? b.lines : [];
  const payrollPaidDate = (b.payrollPaidDate ?? "").trim() || null;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1) report header: payroll-paid date (+ status when recording reimbursement)
  const reportUpdate: Record<string, unknown> = { payroll_paid_date: payrollPaidDate };
  if (opts.markReimbursed) {
    reportUpdate.status = "reimbursed";
    reportUpdate.reimbursed_at = now;
  }
  const { error: rErr } = await admin.from("expense_reports").update(reportUpdate).eq("id", reportId);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // 2) per-line recon merged into extracted.recon. Read current extracted, merge, write back.
  const ids = lines.map((l) => l.id).filter((x) => typeof x === "string" && x.trim());
  if (ids.length) {
    const { data: existing, error: exErr } = await admin
      .from("payables_queue")
      .select("id, extracted")
      .in("id", ids);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of existing ?? []) {
      byId.set(row.id, (row.extracted as Record<string, unknown>) ?? {});
    }
    for (const l of lines) {
      const cur = byId.get(l.id) ?? {};
      const recon = {
        reimbursed: Number(l.reimbursed ?? 0),
        variance_entity: (l.varianceEntity ?? "").trim() || null,
      };
      const next = { ...cur, recon };
      const { error: uErr } = await admin
        .from("payables_queue")
        .update({ extracted: next })
        .eq("id", l.id);
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, status: opts.markReimbursed ? "reimbursed" : "submitted" });
}
