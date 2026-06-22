import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";

/**
 * The PEOPLE MASTER for the trip Travelers picker — the canonical names from the `people`
 * config blob (the same master `shared/people.py` canonicalizes against) UNION every traveler
 * name already used on a trip. Deduped (case-insensitive) + sorted. The picker offers these and
 * lets the operator type-to-add a new one, so traveler names stay consistent instead of drifting
 * (Jacob, 2026-06-21).
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const names = new Map<string, string>(); // lowercased → display
  const add = (n: unknown) => {
    const s = String(n ?? "").trim();
    if (s && !names.has(s.toLowerCase())) names.set(s.toLowerCase(), s);
  };

  // 1) canonical names from the people master (public.people table — the `people` config blob is retired)
  try {
    const { data } = await admin.from("people").select("canonical");
    for (const p of (data ?? []) as { canonical?: string }[]) add(p?.canonical);
  } catch {
    /* table optional — fall through to trip names */
  }

  // 2) every traveler name already used on a manual trip
  try {
    const { data } = await admin.from("trips").select("travelers").not("travelers", "is", null);
    for (const row of data ?? []) for (const t of (row.travelers as unknown[]) ?? []) add(t);
  } catch {
    /* best-effort */
  }

  const people = [...names.values()].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ people });
}
