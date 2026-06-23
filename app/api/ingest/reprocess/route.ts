import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Reset an errored ingestion job back to pending so the backend processor
 * retries it. Used from the ingestion log when a transient failure (e.g. a
 * config issue) caused a document to be excluded.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("inbox");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  // Only retry jobs that still have their staged file (storage_path present).
  const { data: job } = await admin
    .from("ingestion_jobs")
    .select("id, status, storage_path")
    .eq("id", id)
    .single();
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (!job.storage_path) {
    return NextResponse.json(
      { error: "staged file already cleared — re-upload the document" },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("ingestion_jobs")
    .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
