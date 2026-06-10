import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * Approve a batch of payables rows in one shot — the QuickBooks batch checkpoint.
 * Each row keeps its already-confirmed coding; we just set status='approved'
 * (staged for the backend QBO post_runner). Returns how many were staged.
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

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x.trim());
  if (!ids.length) return NextResponse.json({ error: "no ids provided" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payables_queue")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, staged: data?.length ?? 0 });
}
