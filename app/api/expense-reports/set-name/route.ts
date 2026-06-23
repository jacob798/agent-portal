import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

/** Rename a report (the report name/label only — never touches its posted expenses). */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("expense-reports");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let b: { reportId?: string; name?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const reportId = (b.reportId ?? "").trim();
  const name = (b.name ?? "").trim();
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("expense_reports").update({ name }).eq("id", reportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
