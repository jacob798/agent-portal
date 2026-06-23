import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/profile";
import { can } from "@/lib/auth/roles";
import { guardModuleApi } from "@/lib/auth/guard";

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
  const _gate = await guardModuleApi("travel");
  if (_gate.error) return _gate.error;
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

  // CASCADE the entity change to the attached (non-posted) expense rows + the payables_trips cache.
  // Without this, editing a trip's entity (e.g. BC→PER) left the already-attached rows on the OLD
  // entity/GL with no way to fix them — the travel GL is locked in the UI (Jacob, 2026-06-21:
  // "I updated the trip but it isn't updating the personal"). The QB-vendor header is the locked
  // Python source, so we only SWAP the entity token here; the worker's sync_trips fully rebuilds it
  // (incl. dest/date edits) on its next cycle.
  try {
    const ent = update.ent;
    const swapEnt = (s: string | null | undefined): string =>
      (s ?? "").replace(/^(Travel \d{4}-\d{2} - )[A-Z]{2,4}( )/, `$1${ent}$2`);
    const leaf = (dt: string | null): string => {
      const d = (dt ?? "").toLowerCase();
      if (["hotel", "airbnb", "lodging", "accommodation", "stay"].includes(d)) return "Travel Lodging";
      if (["meal", "meals", "dining", "food"].includes(d)) return "Travel Food";
      if (["entertainment", "event"].includes(d)) return "Travel Entertainment";
      return "Travel Transportation";
    };
    const { data: pt } = await admin.from("payables_trips").select("header").eq("trip_id", id).maybeSingle();
    if (pt?.header) await admin.from("payables_trips").update({ entity: ent, header: swapEnt(pt.header) }).eq("trip_id", id);

    const { data: rows } = await admin
      .from("payables_queue")
      .select("id, doc_type, lines, vendor, extracted")
      .eq("trip_id", id).neq("status", "posted").neq("status", "discarded");
    for (const r of rows ?? []) {
      const dt = (r.doc_type as string | null) ?? (r.extracted as { booking_type?: string } | null)?.booking_type ?? null;
      const lines = Array.isArray(r.lines) ? r.lines : [];
      const patch: Record<string, unknown> = { entity: ent, recommended: ent, vendor: swapEnt(r.vendor as string) };
      if (ent === "BC") {
        const bc = ["meal", "meals", "dining", "food"].includes((dt ?? "").toLowerCase()) ? "Meals - General" : "Travel : General";
        patch.gl = "Loan - Builders Capital"; patch.bc_category = bc;
        for (const l of lines) { l.entity = ent; l.gl = "Loan - Builders Capital"; l.bcCategory = bc; }
      } else if (ent === "PER" || ent === "FC") {
        const { data: gla } = await admin.from("gl_accounts").select("account_full_name")
          .eq("entity_code", ent).eq("account_name", leaf(dt)).limit(1);
        const glFull = (gla?.[0]?.account_full_name as string | undefined) ?? null;
        patch.bc_category = null;
        if (glFull) patch.gl = glFull;
        for (const l of lines) { l.entity = ent; if (glFull) l.gl = glFull; delete l.bcCategory; }
      } else {
        for (const l of lines) l.entity = ent;
      }
      patch.lines = lines;
      await admin.from("payables_queue").update(patch).eq("id", r.id);
    }
  } catch {
    /* best-effort cascade — the trip edit itself succeeded; the worker's sync_trips reconciles later */
  }

  return NextResponse.json({ ok: true, id });
}
