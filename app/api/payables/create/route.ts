import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { tripVendor } from "@/lib/data/tripVendor";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Manually ADD an expense to the queue — for when extraction produced no row at all (e.g. an award
 * ticket whose receipt we never got, or any expense without a document). The operator types what
 * they know; the row enters the normal coding queue (status 'open') and flows through the existing
 * code → post path. A trip can be attached so it lands on that trip's expenses. payee = the real
 * merchant shown in the app; vendor = the QB posting name (defaults to payee, or the trip label).
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("payables");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let b: {
    payee?: string; amount?: number; entity?: string; gl?: string; paymentMethodId?: string;
    tripId?: string; memo?: string; category?: string; txnDate?: string; docType?: string;
    invoiceNumber?: string; vendor?: string;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const payee = (b.payee ?? "").trim();
  const amount = Number(b.amount ?? 0);
  if (!payee) return NextResponse.json({ error: "payee (merchant) is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "a non-negative amount is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // QB posting name: explicit vendor, else the attached trip's CANONICAL rollup (same
  // build_trip_header_subject format every other travel row uses, so they group in QuickBooks),
  // else the merchant.
  let vendor = (b.vendor ?? "").trim() || payee;
  if (!b.vendor && b.tripId) {
    const { data: trip } = await admin
      .from("trips").select("dest, ent, purpose, start_date, end_date").eq("id", b.tripId).single();
    if (trip?.dest) {
      vendor = tripVendor({
        ent: trip.ent ?? "", purpose: trip.purpose ?? null, dest: trip.dest ?? null,
        start: trip.start_date ?? null, end: trip.end_date ?? null,
      });
    }
  }

  const id = "man_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const row = {
    id,
    vendor,
    sub: b.memo?.trim() || payee,
    memo: b.memo?.trim() || null,
    amount,
    entity: (b.entity ?? "").trim() || null,
    gl: (b.gl ?? "").trim() || null,
    account: null,
    payment_method_id: (b.paymentMethodId ?? "").trim() || null,
    trip_id: (b.tripId ?? "").trim() || null,
    category: (b.category ?? "").trim() || null,
    doc_type: (b.docType ?? "").trim() || null,
    invoice_number: (b.invoiceNumber ?? "").trim() || null,
    txn_date: (b.txnDate ?? "").trim() || null,
    status: "open",
    nodoc: true, // manual add → no document on file (it's a documentation gap, not a blocker)
    extracted: { payee, manual: true },
  };

  const { error } = await admin.from("payables_queue").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
