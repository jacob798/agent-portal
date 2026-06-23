import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Operator corrects the IDENTIFIED document type. We persist the corrected type and FLAG
 * the row for re-extraction (`reextract='doc_type:<type>'`); the worker re-runs extraction
 * against the corrected type's spec and learns vendor→type so the classifier is right next
 * time (Prime Directive #10 §9.1 — wrong type → re-run + learn).
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("payables");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { id?: string; docType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const docType = (body.docType ?? "").trim();
  if (!id || !docType) return NextResponse.json({ error: "id and docType required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("payables_queue")
    .update({ doc_type: docType, reextract: `doc_type:${docType}` })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reextract: true });
}
