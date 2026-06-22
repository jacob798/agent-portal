import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { callWorker } from "@/lib/travel/workerApi";

/**
 * Resolve a "needs a path" ingest exception: record the vendor's pathway (payables vs travel) so
 * every future email from its domain routes deterministically. The learning write is the Python
 * vendor_intake.upsert (it writes vendors + vendor_profiles.email_rules.default + identifier_index
 * coherently), which the portal can't run — so we call the worker's /ingest/add-vendor-path endpoint
 * over the same HMAC channel the travel move-booking flow uses.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { vendor?: string; domain?: string; pipeline?: string; doc_type?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const vendor = (body.vendor ?? "").trim();
  const pipeline = (body.pipeline ?? "").trim();
  if (!vendor || (pipeline !== "travel" && pipeline !== "payables")) {
    return NextResponse.json({ error: "vendor + pipeline (travel|payables) required" }, { status: 400 });
  }

  const res = await callWorker("/ingest/add-vendor-path", {
    vendor,
    domain: (body.domain ?? "").trim(),
    pipeline,
    doc_type: body.doc_type ?? null,
  });
  if (!res.ok) {
    const detail = (res.body?.error as string) || (res.body?.skipped as string) || `worker call failed (${res.status})`;
    return NextResponse.json({ error: detail }, { status: res.status || 502 });
  }
  return NextResponse.json({ ok: true, ...res.body });
}
