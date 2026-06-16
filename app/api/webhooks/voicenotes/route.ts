import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Voicenotes webhook — public entry point for the Briefings pipeline.
 *
 * Voicenotes posts here on recording events. We store transcript-bearing events
 * as a `briefings_notes` row (status='new'); the backend briefings agent then
 * splits/matches and writes held drafts back for review. Voicenotes' own
 * todo/summary events are acknowledged-and-skipped (we re-split ourselves).
 *
 * Auth: this is unauthenticated (Voicenotes has no SSO), so it is gated by a
 * shared secret — set VOICENOTES_WEBHOOK_SECRET and register the URL as
 *   https://agents.foundry-capital.co/api/webhooks/voicenotes?token=<secret>
 *
 * Payload (https://help.voicenotes.com/.../webhooks):
 *   { event, timestamp, data: { id, title, transcript } }
 */
const TRANSCRIPT_EVENTS = new Set(["recording.created", "recording.updated"]);

export async function POST(req: NextRequest) {
  const secret = process.env.VOICENOTES_WEBHOOK_SECRET;
  const token = req.nextUrl.searchParams.get("token");
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const event = String(body?.event ?? "").trim();
  const data = body?.data ?? {};
  const sourceId = data?.id;
  if (sourceId === undefined || sourceId === null || sourceId === "") {
    return NextResponse.json({ error: "missing data.id" }, { status: 400 });
  }

  // Voicenotes' own todo/summary creation events — we re-split, so skip cleanly.
  if (event && !TRANSCRIPT_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, skipped: `non-transcript event ${event}` });
  }

  const transcript = String(data?.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ ok: true, skipped: "no transcript yet" });
  }

  const admin = createAdminClient();
  // Idempotent on source_id. Only refresh transcript while still unprocessed.
  const { data: existing } = await admin
    .from("briefings_notes")
    .select("id,status")
    .eq("source_id", String(sourceId))
    .maybeSingle();

  if (!existing) {
    const ins = await admin.from("briefings_notes").insert({
      source_id: String(sourceId),
      title: String(data?.title ?? "").trim(),
      transcript,
      event,
      status: "new",
    });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, stored: "new" });
  }

  if (existing.status === "new") {
    await admin
      .from("briefings_notes")
      .update({ transcript, event, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  }
  return NextResponse.json({ ok: true, stored: "idempotent" });
}
