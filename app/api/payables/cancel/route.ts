import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Record a travel CANCELLATION's cost treatment on an expense row. A cancellation produces
 * different money events — they are NOT all expenses:
 *   refund   → money came back; the expense is reversed (row discarded, not posted).
 *   ecredit  → airline credit for FUTURE use; NOT an expense now — row removed from the active
 *              queue and the eCredit (amount + number) tracked on the row for later application.
 *   expense  → the cost is borne now (a cancellation/change fee or a forfeited fare on a NOT-
 *              driven-by-me cancellation): the row STAYS and posts, memo flags the cancellation.
 *              This is the operator's "expense early" optionality (the default is to wait until used).
 * The treatment + reason are stored under extracted.cancellation so it's auditable + learnable.
 */
const TREATMENTS = new Set(["refund", "ecredit", "expense"]);

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: {
    id?: string; treatment?: string; reason?: string;
    ecreditAmount?: number | string | null; ecreditNumber?: string | null;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }

  const id = (body.id ?? "").trim();
  const treatment = (body.treatment ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!TREATMENTS.has(treatment)) return NextResponse.json({ error: "bad treatment" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: findErr } = await admin
    .from("payables_queue").select("id, extracted, memo").eq("id", id).maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const extracted = { ...((row.extracted as Record<string, unknown>) ?? {}) };
  extracted.cancellation = {
    treatment,
    reason: (body.reason ?? "").trim() || null,
    ecredit_amount: treatment === "ecredit" ? Number(body.ecreditAmount) || null : null,
    ecredit_number: treatment === "ecredit" ? (body.ecreditNumber ?? "").trim() || null : null,
    at: new Date().toISOString(),
    by: profile.email ?? null,
  };

  const update: Record<string, unknown> = { extracted };
  if (treatment === "expense") {
    // keep it postable; flag the cancellation in the memo so QB shows why a no-trip-taken cost posted.
    const note = `Cancelled${(body.reason ?? "").trim() ? ` — ${(body.reason ?? "").trim()}` : ""}`;
    update.memo = row.memo ? `${row.memo} · ${note}` : note;
  } else {
    // refund or held eCredit → not an expense now; drop from the active queue (recorded above).
    update.status = "discarded";
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, treatment });
}
