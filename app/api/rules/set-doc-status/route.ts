import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

const ALLOWED = ["parked", "in_setup", "active", "drifting", "archived"];

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 500 });
  let body: { docType?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "expected JSON" }, { status: 400 }); }
  const docType = (body.docType ?? "").trim();
  const status = (body.status ?? "").trim();
  if (!docType || !ALLOWED.includes(status)) return NextResponse.json({ error: "docType + valid status required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("doc_types").update({ status }).eq("doc_type", docType);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
