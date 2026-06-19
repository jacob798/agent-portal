import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Create a trip in public.trips — the SAME table the portal lists AND the backend
 * attribution (match_trip / sync_trips) reads. So a trip saved here is immediately the
 * anchor new invoices attribute to. Previously "+ New trip" only updated local React state,
 * so trips vanished on refresh — this persists them.
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDates(start: string, end: string): string {
  if (!start && !end) return "dates TBD";
  const s = start ? new Date(start + "T00:00") : null;
  const e = end ? new Date(end + "T00:00") : s;
  if (!s) return "dates TBD";
  const md = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;
  if (!e || +e === +s) return md(s);
  if (s.getMonth() === e.getMonth()) return `${md(s)} – ${e.getDate()}`;
  return `${md(s)} – ${md(e)}`;
}

export async function POST(req: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(profile.role, "act")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY missing in Vercel env" },
      { status: 500 },
    );
  }

  let body: { ent?: string; dest?: string; start?: string; end?: string; purpose?: string; travelers?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const start = (body.start ?? "").slice(0, 10);
  const end = (body.end ?? start).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const id = "trip_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Canonical Title Case (casing only; distinct people stay distinct). (Jacob, 2026-06-19.)
  const travelers = Array.isArray(body.travelers)
    ? body.travelers.map((s: unknown) =>
        String(s).trim().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" "),
      ).filter(Boolean)
    : [];

  const row = {
    id,
    ent: (body.ent ?? "").trim() || "UNK",
    dest: (body.dest ?? "").trim() || "—",
    start_date: start || null,
    end_date: end || null,
    dates: fmtDates(start, end),
    status: end && end >= today ? "up" : "closed",
    purpose: (body.purpose ?? "").trim() || null,
    travelers,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("trips").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id, trip: row });
}
