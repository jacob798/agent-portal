import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Operator approves (or discards) the reviewed drafts for one briefing.
 *
 * Body: { note_id, drafts: [...edited drafts with keep flags...], decision }
 *   decision = "approve" -> status 'confirmed' (backend posts the kept items)
 *            = "discard" -> status 'skipped'
 *
 * Nothing is posted to Pipedrive/Asana here — the backend briefings agent claims
 * 'confirmed' rows and executes the kept drafts. The portal is the review gate.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("briefings");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const noteId = body?.note_id;
  const decision = body?.decision === "discard" ? "discard" : "approve";
  if (!noteId) return NextResponse.json({ error: "missing note_id" }, { status: 400 });

  const update: Record<string, unknown> = {
    status: decision === "discard" ? "skipped" : "confirmed",
    updated_at: new Date().toISOString(),
  };
  if (decision === "approve" && Array.isArray(body?.drafts)) {
    update.drafts = body.drafts; // persist the operator's edits/keep selections
  }
  if (decision === "discard") update.skip_reason = "Discarded by operator";

  const admin = createAdminClient();
  const upd = await admin.from("briefings_notes").update(update).eq("id", noteId);
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: update.status });
}
