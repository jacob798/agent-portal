import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { callWorker } from "@/lib/travel/workerApi";
import { guardModuleApi } from "@/lib/auth/guard";

/**
 * Resolve a DIVERGENCE exception: the operator confirms which pathway a known vendor's diverging
 * document type takes (a travel-confirmation vendor that started sending invoices → payables, or
 * the reverse). Writes a subject RULE on the vendor (via the worker → vendor_intake.upsert), so the
 * router matches it explicitly next time and the flag goes silent.
 */
export async function POST(req: NextRequest) {
  const _gate = await guardModuleApi("ingest-exceptions");
  if (_gate.error) return _gate.error;
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { vendor?: string; pipeline?: string };
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

  const res = await callWorker("/ingest/learn-doc-rule", { vendor, pipeline });
  if (!res.ok) {
    const detail = (res.body?.error as string) || (res.body?.skipped as string) || `worker call failed (${res.status})`;
    return NextResponse.json({ error: detail }, { status: res.status || 502 });
  }
  return NextResponse.json({ ok: true, ...res.body });
}
