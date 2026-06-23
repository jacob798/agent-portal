import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upload entry point for document ingestion. Stores each file in the private
 * `documents` Storage bucket and inserts a pending `ingestion_jobs` row. The
 * backend processor (runs separately) classifies, files to Dropbox, and writes
 * the resulting payables_queue row.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("inbox");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form-data" }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "no files provided" }, { status: 400 });
  // teach-from-a-sample: when set, the worker extracts AGAINST this type + suggests fields
  // instead of creating a payables row.
  const teachDocType = ((form.get("teachDocType") as string) || "").trim() || null;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }
  const admin = createAdminClient();
  const uploadedBy = UUID.test(profile.id) ? profile.id : null;
  const jobs: string[] = [];

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;

    const up = await admin.storage
      .from("documents")
      .upload(path, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const ins = await admin
      .from("ingestion_jobs")
      .insert({
        source: teachDocType ? "teach" : "upload",
        storage_path: path,
        original_filename: file.name,
        uploaded_by: uploadedBy,
        teach_doc_type: teachDocType,
      })
      .select("id")
      .single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    jobs.push(ins.data.id as string);
  }

  return NextResponse.json({ ok: true, jobs });
}
