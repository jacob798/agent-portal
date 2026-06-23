import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Create a new expense report header (status 'draft'). The expenses themselves are
 * attached afterward via add-expenses (which sets payables_queue.report_id).
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("expense-reports");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let b: { name?: string; entity?: string; dateFrom?: string; dateTo?: string; note?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const name = (b.name ?? "").trim();
  const entity = (b.entity ?? "").trim();
  if (!name) return NextResponse.json({ error: "a report name is required" }, { status: 400 });
  if (!entity) return NextResponse.json({ error: "an entity is required" }, { status: 400 });

  const id = "er_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const row = {
    id,
    name,
    entity,
    status: "draft",
    date_from: (b.dateFrom ?? "").trim() || null,
    date_to: (b.dateTo ?? "").trim() || null,
    note: (b.note ?? "").trim() || null,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("expense_reports").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id });
}
