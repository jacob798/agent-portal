import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Correct a wrong invoice amount (e.g. the parser read $0 on a paid invoice). Sets the
 * row's total; when the invoice is a single line, the line amount follows so lines still
 * sum to the invoice. Multi-line splits are left to the operator (the drawer shows the
 * "lines = invoice" check). The Dropbox file re-files to the corrected amount at post time.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { id?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const amount = Number(body.amount);
  if (!id || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "id and a non-negative amount required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("payables_queue")
    .select("lines")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "row not found" }, { status: 404 });

  const update: Record<string, unknown> = { amount };
  const lines = Array.isArray(row.lines) ? row.lines : [];
  if (lines.length === 1) {
    lines[0] = { ...lines[0], amount };
    update.lines = lines;
  }

  const { error } = await admin.from("payables_queue").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, amount });
}
