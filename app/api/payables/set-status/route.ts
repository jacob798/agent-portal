import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Move a batch of payables rows through the lifecycle and persist it:
 *   open      → back in the review queue (un-stage)
 *   approved  → staged for the QuickBooks batch post
 *   discarded → dropped (e.g. confirmed duplicate); hidden from the queue
 *   reclassified → sent to Travel; leaves the active queue but stays recoverable
 *                  (still loaded, rendered resolved with a "Back to review" action)
 * One endpoint so every bulk action (Move-to-review, Post, Discard, Reclassify)
 * actually sticks across reloads instead of mutating only local state.
 */
const ALLOWED = new Set(["open", "approved", "discarded", "reclassified"]);

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

  let body: { ids?: string[]; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter((x) => typeof x === "string" && x.trim());
  const status = body.status ?? "";
  if (!ids.length) return NextResponse.json({ error: "no ids" }, { status: 400 });
  if (!ALLOWED.has(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> =
    status === "approved"
      ? { status, approved_at: now, auto: true, exception: null, reason: null }
      : status === "open"
        ? { status, approved_at: null, auto: false, exception: "entity", reason: "Returned to review" }
        : status === "reclassified"
          ? { status, auto: false } // sent to Travel; recoverable
          : { status }; // discarded

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payables_queue")
    .update(update)
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: data?.length ?? 0, status });
}
