import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";

/**
 * Edit a trip's header (entity / destination / dates / purpose) in public.trips —
 * the single source the portal shows AND the backend attribution reads, so an
 * entity edit immediately changes how new invoices attribute. `dates` (the display
 * string) and `status` (upcoming vs past) are recomputed from the ISO dates.
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

  let body: { id?: string; ent?: string; dest?: string; start?: string; end?: string; purpose?: string; travelers?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no trip id" }, { status: 400 });

  const start = (body.start ?? "").slice(0, 10);
  const end = (body.end ?? start).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const update = {
    ent: (body.ent ?? "").trim() || "UNK",
    dest: (body.dest ?? "").trim() || "—",
    start_date: start || null,
    end_date: end || null,
    dates: fmtDates(start, end),
    status: end && end >= today ? "up" : "closed",
    purpose: (body.purpose ?? "").trim() || null,
    // Canonical Title Case — keeps a name consistent with the flights/everywhere. Casing only;
    // distinct people stay distinct (Jacob Wolbach ≠ William Jacob Wolbach). (Jacob, 2026-06-19.)
    travelers: Array.isArray(body.travelers)
      ? body.travelers.map((s: unknown) =>
          String(s).trim().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" "),
        ).filter(Boolean)
      : [],
  };

  const admin = createAdminClient();
  const { data, error } = await admin.from("trips").update(update).eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "trip not found" }, { status: 404 });

  return NextResponse.json({ ok: true, id });
}
