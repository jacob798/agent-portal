import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Answer an inline QUESTION the system raised on a row (extracted.question) — the alternative to a
 * dead-end "needs review" state. The first question kind is `cost_zero` (a $0 expense, e.g. an award
 * ticket whose cash charge wasn't captured): the operator either ENTERS the real amount or ACCEPTS
 * $0. Answering writes the value and CLEARS the question so the row proceeds. The committed answer is
 * the label (Universal Learning Standard). Works on travel-staged rows and payables rows alike (one
 * table). Generic over question kinds — new kinds add an option id, not a new route.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { id?: string; optionId?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const optionId = (body.optionId ?? "").trim();
  if (!id || !optionId) return NextResponse.json({ error: "id and optionId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("payables_queue")
    .select("extracted, lines")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });

  const extracted = (row.extracted ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (optionId === "enter_amount") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "a non-negative amount is required" }, { status: 400 });
    }
    update.amount = amount;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    if (lines.length === 1) {
      lines[0] = { ...lines[0], amount };
      update.lines = lines;
    }
    extracted.cost_resolved = "entered";
  } else if (optionId === "accept_zero") {
    extracted.cost_resolved = "accepted_zero";
  } else {
    return NextResponse.json({ error: `unknown optionId '${optionId}'` }, { status: 400 });
  }

  // Clear the question so the row leaves the "needs answer" state.
  delete extracted.question;
  update.extracted = extracted;

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, optionId });
}
