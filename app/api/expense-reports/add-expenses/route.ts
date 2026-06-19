import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Add (or remove) payables rows to/from a report by setting payables_queue.report_id.
 *   add=true  → set report_id = reportId  (only on rows currently null or already this report —
 *               never STEAL a row that belongs to another report)
 *   add=false → clear report_id           (only on rows currently this report)
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let b: { reportId?: string; ids?: string[]; add?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const reportId = (b.reportId ?? "").trim();
  const ids = (b.ids ?? []).filter((x) => typeof x === "string" && x.trim());
  const add = b.add !== false; // default true
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });

  const admin = createAdminClient();

  if (add) {
    // Only claim rows that are unclaimed OR already on this report — never steal another report's.
    const { data, error } = await admin
      .from("payables_queue")
      .update({ report_id: reportId })
      .in("id", ids)
      .or(`report_id.is.null,report_id.eq.${reportId}`)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: data?.length ?? 0 });
  }

  // remove: only detach rows currently on this report
  const { data, error } = await admin
    .from("payables_queue")
    .update({ report_id: null })
    .in("id", ids)
    .eq("report_id", reportId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data?.length ?? 0 });
}
