import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Correct the MERCHANT (payee) on a TRAVEL row. The QB vendor stays the trip rollup
 * (build_trip_header_subject) — this only fixes the displayed merchant + the memo when the
 * parse mis-IDed it (e.g. an Uber receipt that read as "Lufthansa"). Stores extracted.payee
 * and refreshes the memo's leading "<merchant> · …" so the row reads correctly.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { id?: string; payee?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const payee = (body.payee ?? "").trim();
  if (!id || !payee) return NextResponse.json({ error: "id and payee required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("payables_queue").select("extracted, memo").eq("id", id).single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });

  const ex = (row.extracted && typeof row.extracted === "object") ? { ...(row.extracted as Record<string, unknown>) } : {};
  const oldPayee = String(ex.payee ?? "").trim();
  ex.payee = payee;

  // Swap the old merchant for the new one at the FRONT of the memo ("Lufthansa · 2026-02-21" ->
  // "Uber · 2026-02-21"). Only the leading token, so a vendor name that recurs later is untouched.
  const update: Record<string, unknown> = { extracted: ex };
  const memo = String(row.memo ?? "");
  if (oldPayee && memo.startsWith(oldPayee)) {
    update.memo = payee + memo.slice(oldPayee.length);
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, payee });
}
