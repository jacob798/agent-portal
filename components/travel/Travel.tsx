"use client";

import { useState } from "react";
import {
  Printer,
  Download,
  ChevronLeft,
  FileText,
  Search,
  Plus,
  Pencil,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { tripVendor } from "@/lib/data/tripVendor";
import type { Trip, TripExpense, QueueExpense, OverlapException } from "@/lib/data/travel";
import { ENT, money } from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import FilterTabs from "@/components/ui/FilterTabs";
import Modal from "@/components/ui/Modal";
import Drawer from "@/components/ui/Drawer";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const BRANDS = {
  BC: { mark: "BCX", full: "Builders Capital", font: "'Roboto',Arial,sans-serif", navy: "#10102e", accent: "#177245", accent2: "#7bbf43" },
  _def: { mark: "Foundry", full: "Foundry Capital", font: "inherit", navy: "#0a2c4e", accent: "#1768a3", accent2: "#5ba3d2" },
};
const brandFor = (ent: string) => (ent === "BC" ? BRANDS.BC : BRANDS._def);

// BC reimburses via Paylocity, so BC expenses show the Builders Capital category
// code (e.g. "Meals - General"), NOT the balance-sheet GL "Loan - Builders Capital".
// Foundry/Personal show the real Travel GL account.
const expenseCode = (ent: string, e: { gl: string; bcCategory?: string }) =>
  ent === "BC" ? e.bcCategory || e.gl : e.gl;
const codeLabel = (ent: string) => (ent === "BC" ? "BCX category" : "GL account");

// The trip-rollup QB vendor every Denver charge posts under (build_trip_header_subject).
const TRIPVEND = "Travel 2026-06 — Builders Capital · Denver Site Visit (6/4–6/7)";

const NEW_TRIP_ENTITIES: { code: string; label: string }[] = [
  { code: "BC", label: "Builders Capital" },
  { code: "FC", label: "Foundry Capital" },
  { code: "PER", label: "Personal" },
  { code: "WJW", label: "WJW Investments" },
];

export default function Travel({
  trips: initialTrips,
  queue,
  overlaps = [],
}: {
  trips: Trip[];
  queue: QueueExpense[];
  overlaps?: OverlapException[];
}) {
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [view, setView] = useState("queue");
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [conf, setConf] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [ovDone, setOvDone] = useState<Record<string, string>>({});
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [zipping, setZipping] = useState(false);
  const { message, toast } = useToast();
  const router = useRouter();

  // Download the trip's expense .zip (manifest CSV + every receipt PDF) from the server.
  async function downloadZip(t: Trip) {
    setZipping(true);
    try {
      const res = await fetch(`/api/travel/export-zip?trip=${encodeURIComponent(t.id)}`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t.dest.replace(/[^\w.\-]+/g, "_")}_expense_report.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const got = res.headers.get("X-Receipts-Attached") ?? "?";
      const miss = res.headers.get("X-Receipts-Missing") ?? "0";
      toast(`✓ ${t.dest} report — ${got} receipt(s)${miss !== "0" ? ` · ${miss} missing` : ""}`);
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : "try again"}`);
    } finally {
      setZipping(false);
    }
  }

  const openTrip = trips.find((t) => t.id === openTripId) || null;
  const reportTrip = trips.find((t) => t.id === reportId) || null;
  const drawerExp = queue.find((q) => q.id === drawerId) || null;
  const pending = queue.filter((q) => !done[q.id]);
  const openOverlaps = overlaps.filter((o) => !ovDone[o.id]);

  function confirmAll() {
    const next = { ...done };
    queue.forEach((q) => {
      const checked = q.id in conf ? conf[q.id] : q.suggested;
      if (checked && !q.home) next[q.id] = "→ " + q.trip;
    });
    setDone(next);
    toast("✓ Confirmed all suggested trip expenses");
  }

  // Resolve an expense from the drawer or an inline action.
  function resolve(id: string, label: string) {
    setDone((d) => ({ ...d, [id]: label }));
    setDrawerId(null);
  }

  function resolveOverlap(id: string, opt: string) {
    setOvDone((d) => ({ ...d, [id]: opt }));
    toast(`✓ Assigned to ${opt}`);
  }

  async function createTrip(t: Trip) {
    setTrips((prev) => [t, ...prev]); // optimistic
    setNewTripOpen(false);
    setView("trips");
    try {
      const res = await fetch("/api/travel/create-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ent: t.ent, dest: t.dest, start: t.start, end: t.end, purpose: t.purpose }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `failed (${res.status})`);
      // swap the temp local id for the persisted one so edits/attribution use the real id
      setTrips((prev) => prev.map((x) => (x.id === t.id ? { ...x, id: j.id } : x)));
      toast(`✓ Saved ${t.dest} — new invoices in this window will attribute to it`);
    } catch (e) {
      setTrips((prev) => prev.filter((x) => x.id !== t.id)); // revert — it didn't save
      toast(`Couldn't save trip: ${e instanceof Error ? e.message : "try again"}`);
    }
  }

  // Stage this trip's ready invoices for QuickBooks — reuses the payables batch
  // checkpoint (sets status=approved → backend post_runner posts under the trip vendor).
  async function postTrip(t: Trip) {
    const ids = t.exps.filter((e) => e.id && e.status === "open").map((e) => e.id!);
    if (!ids.length) {
      toast("Nothing to post — all caught up");
      return;
    }
    try {
      const res = await fetch("/api/payables/post-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "post failed");
      toast(`✓ Posting ${j.staged} invoice${j.staged === 1 ? "" : "s"} → QuickBooks`);
      router.refresh();
    } catch (e) {
      toast(`Couldn't post: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {openTrip ? (
        <TripDetail
          trip={openTrip}
          onBack={() => setOpenTripId(null)}
          onReport={() => setReportId(openTrip.id)}
          onPost={() => postTrip(openTrip)}
          onEdit={() => setEditTrip(openTrip)}
        />
      ) : (
        <>
          <PageHeader
            title="Travel"
            subtitle="Trip expense attribution — confirm what the agent suggests; only date-overlaps need you."
            action={
              <Button onClick={() => setNewTripOpen(true)}>
                <Plus className="h-4 w-4" /> New trip
              </Button>
            }
          />
          <div className="mt-5">
            <FilterTabs
              active={view}
              onChange={setView}
              tabs={[
                { key: "queue", label: "Expense queue", count: pending.length },
                { key: "trips", label: "Trips", count: trips.length },
              ]}
            />
          </div>

          {view === "queue" && (
            <ExpenseQueue
              queue={queue}
              conf={conf}
              done={done}
              overlaps={openOverlaps}
              setConf={setConf}
              onConfirmAll={confirmAll}
              onOpen={(id) => setDrawerId(id)}
              onMakeTrip={(id) => resolve(id, "→ Denver (override)")}
              onResolveOverlap={resolveOverlap}
            />
          )}

          {view === "trips" && (
            <TripsList
              trips={trips}
              search={search}
              setSearch={setSearch}
              onOpen={setOpenTripId}
            />
          )}
        </>
      )}

      {/* Per-expense drawer */}
      <ExpenseDrawer
        exp={drawerExp}
        onClose={() => setDrawerId(null)}
        onConfirm={(id, label) => resolve(id, label)}
      />

      {/* New trip */}
      <NewTripModal open={newTripOpen} onClose={() => setNewTripOpen(false)} onCreate={createTrip} />

      {editTrip && (
        <EditTripModal
          trip={editTrip}
          onClose={() => setEditTrip(null)}
          onSaved={() => { setEditTrip(null); router.refresh(); }}
          toast={toast}
        />
      )}

      {/* Branded report */}
      <Modal
        open={!!reportTrip}
        onClose={() => setReportId(null)}
        title={reportTrip ? `${brandFor(reportTrip.ent).mark} expense report — ${reportTrip.dest}` : ""}
        width="max-w-3xl"
        footer={
          <>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </Button>
            <Button
              variant="ghost"
              disabled={zipping}
              onClick={() => reportTrip && downloadZip(reportTrip)}
            >
              {zipping ? "Building…" : "Download .zip"}
            </Button>
          </>
        }
      >
        {reportTrip && <BrandedReport trip={reportTrip} />}
      </Modal>

      <Toast message={message} />
    </div>
  );
}

// ---------- expense queue ----------
function ExpenseQueue({
  queue,
  conf,
  done,
  overlaps,
  setConf,
  onConfirmAll,
  onOpen,
  onMakeTrip,
  onResolveOverlap,
}: {
  queue: QueueExpense[];
  conf: Record<string, boolean>;
  done: Record<string, string>;
  overlaps: OverlapException[];
  setConf: (fn: (c: Record<string, boolean>) => Record<string, boolean>) => void;
  onConfirmAll: () => void;
  onOpen: (id: string) => void;
  onMakeTrip: (id: string) => void;
  onResolveOverlap: (id: string, opt: string) => void;
}) {
  const pending = queue.filter((q) => !q.home && !done[q.id]).length;
  const homeCount = queue.filter((q) => q.home).length;
  return (
    <>
      {/* Overlap exceptions — the only thing the operator is forced to resolve */}
      {overlaps.map((o) => (
        <div
          key={o.id}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none">⚠️</span>
            <div>
              <div className="text-sm font-semibold text-amber-900">{o.title}</div>
              <div className="text-[12.5px] text-amber-700/90">{o.sub}</div>
            </div>
          </div>
          <div className="flex gap-2">
            {o.opts.map((opt) => (
              <button
                key={opt}
                onClick={() => onResolveOverlap(o.id, opt)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-100"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        ✓ Itineraries auto-tie to the matching trip. You’re only asked when a date{" "}
        <b>overlaps two trips</b>. Auto-coded trip expenses post silently — confirm the suggestions
        below.
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Trip expenses to confirm</h2>
            <p className="text-[12.5px] text-slate-500">
              {pending} suggested{homeCount ? ` · ${homeCount} home → Payables` : ""}
            </p>
          </div>
          {pending > 0 && (
            <Button variant="success" onClick={onConfirmAll}>✓ Confirm all</Button>
          )}
        </div>
        {queue.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No trip expenses waiting — new receipts appear here as the agent attributes them.
          </div>
        )}
        {queue.map((q) => {
          if (done[q.id])
            return (
              <div key={q.id} className="grid grid-cols-[28px_2fr_1.5fr_1.7fr] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
                <span className="text-lg">{q.ic}</span>
                <div>
                  <div className="font-semibold text-slate-900">{q.merchant}</div>
                  <div className="text-[12.5px] text-slate-500">{q.sub}</div>
                </div>
                <div />
                <div className="text-right text-[12.5px] font-semibold text-emerald-600">✓ {done[q.id]}</div>
              </div>
            );
          const checked = q.id in conf ? conf[q.id] : q.suggested;
          return (
            <div
              key={q.id}
              onClick={() => onOpen(q.id)}
              className={`grid cursor-pointer grid-cols-[34px_28px_2fr_1.5fr_1.7fr] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-brand/[0.03] ${q.home ? "bg-slate-50/60" : ""}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConf((c) => ({ ...c, [q.id]: !(q.id in c ? c[q.id] : q.suggested) }));
                }}
                className={`flex h-5.5 w-5.5 items-center justify-center rounded-md border-2 text-xs font-bold ${
                  checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"
                } ${q.home ? "border-dashed" : ""}`}
              >
                {checked ? "✓" : ""}
              </button>
              <span className="text-center text-lg">{q.ic}</span>
              <div>
                <div className="font-semibold text-slate-900">{q.merchant}</div>
                <div className="text-[12.5px] text-slate-500">
                  {q.sub} ·{" "}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpen(q.id); }}
                    className="text-brand hover:underline"
                  >
                    📄 view
                  </button>
                </div>
              </div>
              <div className="text-[12.5px] font-semibold">
                {q.home ? (
                  <span className="text-slate-500">📍 {q.loc} · home</span>
                ) : (
                  <span className="text-emerald-600">
                    📍 {q.loc === "—" ? "no location" : q.loc}
                    {q.postTrip && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">post-trip</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-2.5 text-[13px]">
                {q.home ? (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-600">→ Payables (not a trip)</span>
                ) : (
                  <span className="rounded-md bg-brand/10 px-2 py-1 text-[12px] font-semibold text-brand-navy">{q.trip}</span>
                )}
                <span className="tabular-nums text-slate-500">{money(q.amount)}</span>
                {q.home ? (
                  <button onClick={(e) => { e.stopPropagation(); onMakeTrip(q.id); }} className="text-xs font-semibold text-brand">make trip</button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onOpen(q.id); }} className="text-xs font-semibold text-brand">change</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- per-expense drawer ----------
function ExpenseDrawer({
  exp,
  onClose,
  onConfirm,
}: {
  exp: QueueExpense | null;
  onClose: () => void;
  onConfirm: (id: string, label: string) => void;
}) {
  // Keep the last non-null expense so content doesn't blank out during the close transition.
  const [last, setLast] = useState<QueueExpense | null>(null);
  if (exp && exp !== last) setLast(exp);
  const x = exp || last;

  return (
    <Drawer
      open={!!exp}
      onClose={onClose}
      title={x ? `${x.merchant} — ${money(x.amount)}` : ""}
      subtitle={x?.sub}
      footer={
        x &&
        (x.home ? (
          <>
            <Button variant="ghost" onClick={() => onConfirm(x.id, "→ Denver (override)")}>Make trip expense</Button>
            <Button onClick={() => onConfirm(x.id, "Personal")}>Keep as Personal</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Different trip ▾</Button>
            <Button variant="success" onClick={() => onConfirm(x.id, "→ " + x.trip)}>
              <Check className="h-4 w-4" /> Confirm → {x.trip} trip
            </Button>
          </>
        ))
      }
    >
      {x && (
        <div className="divide-y divide-slate-100">
          {/* Receipt */}
          <section className="pb-5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Receipt / invoice</h3>
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[13px] text-slate-400">
              📸 {x.merchant} — receipt image (preview)
            </div>
            <button className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
              Open in Dropbox <ExternalLink className="h-3 w-3" />
            </button>
          </section>

          {/* Why this trip */}
          <section className="py-5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why this trip</h3>
            <div className="mb-2.5 text-[13.5px] font-semibold text-slate-900">
              {x.home ? "Suggestion: not a trip" : `Suggested: ${x.trip} trip`}
            </div>
            <ul className="space-y-1.5 text-[13px]">
              <Reason ok={!x.home}>
                📍 Location {x.loc === "—" ? "(none — used date + category)" : `= ${x.loc}`}{" "}
                {x.home ? "(home → not a trip)" : "(matches destination)"}
              </Reason>
              <Reason ok>Date {x.postTrip ? "in grace window (post-trip)" : "inside trip window"}</Reason>
              <Reason ok>Travel category ({x.category})</Reason>
            </ul>
          </section>

          {/* QB posting preview */}
          <section className="pt-5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Posts to QuickBooks as</h3>
            {x.home ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                <b>Not a trip expense.</b> Charged at home → posts to Payables as Personal. No trip vendor.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px]">
                  <QbLine k="Vendor" v={<span className="font-semibold text-brand-navy">{TRIPVEND}</span>} />
                  <QbLine k="Memo" v={`${x.merchant} · ${x.category.toLowerCase()}`} />
                  <QbLine k="GL" v={x.gl} />
                  <QbLine k="Entity" v="Builders Capital" />
                </div>
                <p className="mt-2 text-[12px] text-slate-500">
                  ↳ <b>{x.merchant}</b> never becomes its own QuickBooks vendor.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Reason({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-slate-700">
      <span className={`mt-px shrink-0 ${ok ? "text-emerald-600" : "text-slate-400"}`}>
        {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
      <span>{children}</span>
    </li>
  );
}

function QbLine({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="w-14 shrink-0 font-semibold text-slate-500">{k}</span>
      <span className="text-slate-700">{v}</span>
    </div>
  );
}

// ---------- new trip modal ----------
function NewTripModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (t: Trip) => void;
}) {
  const [ent, setEnt] = useState("BC");
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [purpose, setPurpose] = useState("");

  const fmt = (d: string) =>
    d ? new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  function submit() {
    const dates = start || end ? `${fmt(start)}${end ? " – " + fmt(end) : ""}` : "dates TBD";
    const endISO = end || start;
    onCreate({
      id: "new" + Date.now(),
      ent,
      dest: dest || "New destination",
      dates,
      start,
      end: endISO,
      status: endISO && endISO >= new Date().toISOString().slice(0, 10) ? "up" : "closed",
      purpose: purpose || undefined,
      total: 0,
      itin: [],
      exps: [],
    });
    setEnt("BC"); setDest(""); setStart(""); setEnd(""); setPurpose("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New trip"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create trip</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Entity">
          <div className="flex flex-wrap gap-2">
            {NEW_TRIP_ENTITIES.map((e) => (
              <button
                key={e.code}
                onClick={() => setEnt(e.code)}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  ent === e.code
                    ? "border-brand-navy bg-brand-navy text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Destination">
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="e.g. Denver, CO" className={INPUT} />
        </Field>
        <div className="flex gap-3">
          <Field label="Start date" className="flex-1">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} />
          </Field>
          <Field label="End date" className="flex-1">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field label="Purpose (optional)">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Site visit — Iota St" className={INPUT} />
        </Field>
        <div className="rounded-lg border border-brand/20 bg-brand/[0.04] px-3 py-2.5 text-[12.5px] text-slate-600">
          ↻ On create, recent receipts in this window are re-scanned and queued.
        </div>
      </div>
    </Modal>
  );
}

// ---------- edit trip ----------
function EditTripModal({
  trip,
  onClose,
  onSaved,
  toast,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string) => void;
}) {
  const [ent, setEnt] = useState(trip.ent);
  const [dest, setDest] = useState(trip.dest);
  const [start, setStart] = useState(trip.start);
  const [end, setEnd] = useState(trip.end);
  const [purpose, setPurpose] = useState(trip.purpose ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/travel/update-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, ent, dest, start, end, purpose }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      toast(`✓ Updated ${dest || "trip"}`);
      onSaved();
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit trip"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Entity">
          <div className="flex flex-wrap gap-2">
            {EDIT_TRIP_ENTITIES.map((e) => (
              <button
                key={e.code}
                onClick={() => setEnt(e.code)}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  ent === e.code
                    ? "border-brand-navy bg-brand-navy text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Destination">
          <input value={dest} onChange={(e) => setDest(e.target.value)} className={INPUT} />
        </Field>
        <div className="flex gap-3">
          <Field label="Start date" className="flex-1">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} />
          </Field>
          <Field label="End date" className="flex-1">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={INPUT} />
          </Field>
        </div>
        <Field label="Purpose">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={INPUT} />
        </Field>
        <div className="rounded-lg border border-brand/20 bg-brand/[0.04] px-3 py-2.5 text-[12.5px] text-slate-600">
          Updates the trip record — the report, the QuickBooks vendor name, and how new invoices attribute to this trip.
        </div>
      </div>
    </Modal>
  );
}

// Travel entities (CLAUDE.md): FC, BC, PER, UNK.
const EDIT_TRIP_ENTITIES: { code: string; label: string }[] = [
  { code: "BC", label: "Builders Capital" },
  { code: "FC", label: "Foundry Capital" },
  { code: "PER", label: "Personal" },
  { code: "UNK", label: "Unknown" },
];

const INPUT = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

// ---------- trips list ----------
function TripsList({
  trips,
  search,
  setSearch,
  onOpen,
}: {
  trips: Trip[];
  search: string;
  setSearch: (s: string) => void;
  onOpen: (id: string) => void;
}) {
  const [ent, setEnt] = useState<string>("ALL");
  const upcoming = trips.filter((t) => t.status === "up");
  const rest = trips.filter((t) => t.status !== "up");

  // Entity filter options present in the data (consistent selection criteria).
  const ents = Array.from(new Set(rest.map((t) => t.ent)));
  const q = search.toLowerCase();
  const list = rest.filter(
    (t) =>
      (ent === "ALL" || t.ent === ent) &&
      (!q || `${ENT[t.ent] ?? t.ent} ${t.dest} ${t.purpose ?? ""} ${t.dates}`.toLowerCase().includes(q)),
  );
  const filtered = ent !== "ALL" || q;

  return (
    <div className="mt-4 space-y-6">
      {upcoming.length > 0 && (
        <Group label={`Upcoming (${upcoming.length})`}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {upcoming.map((t) => (
              <TripRow key={t.id} t={t} onOpen={onOpen} upcoming />
            ))}
          </div>
        </Group>
      )}

      <Group label={`All trips (${filtered ? `${list.length} of ${rest.length}` : rest.length})`}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <FilterChip active={ent === "ALL"} onClick={() => setEnt("ALL")}>All</FilterChip>
          {ents.map((e) => (
            <FilterChip key={e} active={ent === e} onClick={() => setEnt(e)}>
              {ENT[e] ?? e}
            </FilterChip>
          ))}
          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trips…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {list.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No matching trips.</div>
          ) : (
            list.map((t) => <TripRow key={t.id} t={t} onOpen={onOpen} />)
          )}
        </div>
      </Group>
    </div>
  );
}

function TripRow({ t, onOpen, upcoming }: { t: Trip; onOpen: (id: string) => void; upcoming?: boolean }) {
  return (
    <button
      onClick={() => onOpen(t.id)}
      className="grid w-full grid-cols-[160px_1fr_120px_92px] items-center gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-brand/[0.03]"
    >
      <Badge tone="indigo">{ENT[t.ent] ?? t.ent}</Badge>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{t.dest}</div>
        <div className="truncate text-[12.5px] text-slate-500">{t.purpose ?? "—"}</div>
      </div>
      <div className="text-[12.5px] text-slate-500">{t.dates}</div>
      <div className="text-right text-[13px] font-semibold tabular-nums">
        {upcoming ? (
          <span className="text-brand-sky">Upcoming</span>
        ) : t.total > 0 ? (
          money(t.total)
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
    </button>
  );
}

function ExpenseStatusChip({ e }: { e: TripExpense }) {
  if (e.needsDoc)
    return <Badge tone="amber">Needs doc</Badge>;
  if (e.status === "posted")
    return <Badge tone="green" dot>Posted</Badge>;
  if (e.status === "staged")
    return <Badge tone="indigo" dot>Staged</Badge>;
  return <Badge tone="neutral">Ready</Badge>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
        active ? "border-brand-navy bg-brand-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- trip detail ----------
function TripDetail({
  trip,
  onBack,
  onReport,
  onPost,
  onEdit,
}: {
  trip: Trip;
  onBack: () => void;
  onReport: () => void;
  onPost: () => void;
  onEdit: () => void;
}) {
  const b = brandFor(trip.ent);
  const postable = trip.exps.filter((e) => e.id && e.status === "open").length;
  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft className="h-4 w-4" /> Trips
      </button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-navy">{trip.dest}</h1>
            <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold text-brand transition hover:border-brand hover:bg-brand/5">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-500">{ENT[trip.ent] ?? trip.ent} · {trip.dates}</p>
          <p className="mt-2 text-[13.5px]">
            <span className="mr-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Purpose</span>
            {trip.purpose ?? "— (add one)"}
          </p>
        </div>
        <div className="text-right">
          <Badge tone={trip.status === "up" ? "indigo" : "neutral"} dot>
            {trip.status === "up" ? "Upcoming" : "Past trip"}
          </Badge>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onReport}>
              <Printer className="h-3.5 w-3.5" /> Print / Save PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={onReport}>
              <Download className="h-3.5 w-3.5" /> Export (.zip)
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Exports as <b className="text-brand-navy">{b.mark}</b> branded report
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-[13.5px] font-semibold">Itinerary — what’s scheduled</div>
        {trip.itin.length ? (
          trip.itin.map((i, k) => (
            <div key={k} className="flex items-center gap-3.5 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="text-lg">{i.ic}</span>
              <span className="w-24 shrink-0 text-[12.5px] text-slate-500">{i.when}</span>
              <div>
                <div className="font-medium">{i.what}</div>
                <div className="text-[12.5px] text-slate-500">{i.sub}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-slate-400">No itinerary items yet.</div>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[13.5px] font-semibold">Trip expenses ({trip.exps.length})</div>
          <div className="flex items-center gap-3">
            {postable > 0 && (
              <Button variant="success" size="sm" onClick={onPost}>
                ✓ Post {postable} → QuickBooks
              </Button>
            )}
            <span className="text-[13.5px] font-semibold tabular-nums">{money(trip.total)}</span>
          </div>
        </div>
        {trip.exps.length ? (
          trip.exps.map((e, k) => (
            <div key={e.id ?? k} className="flex items-center gap-3.5 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="text-lg">{e.ic}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.what}</div>
                <div className="truncate text-[12.5px] text-slate-500">
                  {expenseCode(trip.ent, e)} ·{" "}
                  {e.needsDoc ? (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600">⚠ no receipt</span>
                  ) : e.docUrl ? (
                    <a
                      href={e.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 hover:underline"
                    >
                      <FileText className="h-3 w-3" /> ✓ receipt
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold">✓ receipt</span>
                  )}
                </div>
              </div>
              <ExpenseStatusChip e={e} />
              <span className="w-20 text-right font-semibold tabular-nums">{money(e.amount)}</span>
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-slate-400">
            No expenses attributed yet — invoices post here as they’re received and matched to this trip.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[13px] text-slate-600">
        Posts to QuickBooks under one vendor — <b className="text-brand-navy">{tripVendor(trip)}</b>. Each merchant is a memo line, never its own vendor.
      </div>
    </div>
  );
}

// ---------- branded report sheet ----------
function FoundryMark({ accent, accent2 }: { accent: string; accent2: string }) {
  return (
    <svg viewBox="0 0 950 950" style={{ width: 34, height: 34 }}>
      <rect x="260" width="690" height="260" fill={accent2} />
      <polygon points="260,0 260,260 0,260" fill="#fff" />
      <rect y="260" width="260" height="690" fill={accent} />
      <polygon points="510,510 950,510 510,950" fill="#fff" />
    </svg>
  );
}

function BrandedReport({ trip }: { trip: Trip }) {
  const b = brandFor(trip.ent);
  return (
    <div className="print-sheet" style={{ fontFamily: b.font, color: "#1f2937" }}>
      <div className="flex items-center justify-between px-2 py-4" style={{ background: b.navy, borderBottom: `5px solid ${b.accent2}`, color: "#fff", margin: "-1.25rem -1.5rem 1.25rem", paddingLeft: "1.5rem", paddingRight: "1.5rem" }}>
        <div className="flex items-center gap-2.5 text-2xl font-extrabold tracking-wide">
          {b.mark === "BCX" ? (
            <span><span style={{ color: b.accent2 }}>B</span>CX</span>
          ) : (
            <>
              <FoundryMark accent={b.accent} accent2={b.accent2} />
              <span>Foundry</span>
            </>
          )}
        </div>
        <div className="text-xs font-semibold uppercase tracking-[2px] opacity-80">Travel Expense Report</div>
      </div>
      <div className="mb-5 flex flex-wrap gap-y-2 gap-x-9 text-[13px]">
        <Meta k="Traveler" v="Jacob Wolbach" />
        <Meta k="Entity" v={b.full} />
        <Meta k="Destination" v={trip.dest} />
        <Meta k="Dates" v={trip.dates} />
        <Meta k="Purpose" v={trip.purpose ?? "—"} full />
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr style={{ color: b.accent }}>
            <th className="border-b-2 border-current py-1.5 pr-2 text-left text-[10.5px] font-bold uppercase tracking-wide">Date</th>
            <th className="border-b-2 border-current py-1.5 px-2 text-left text-[10.5px] font-bold uppercase tracking-wide">Vendor</th>
            <th className="border-b-2 border-current py-1.5 px-2 text-left text-[10.5px] font-bold uppercase tracking-wide">{codeLabel(trip.ent)}</th>
            <th className="border-b-2 border-current py-1.5 px-2 text-center text-[10.5px] font-bold uppercase tracking-wide">Documentation</th>
            <th className="border-b-2 border-current py-1.5 pl-2 text-right text-[10.5px] font-bold uppercase tracking-wide">Amount</th>
          </tr>
        </thead>
        <tbody>
          {trip.exps.map((e, k) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="py-2 pr-2">{e.sub.includes("·") ? e.sub.split("·").pop()!.trim() : trip.dates}</td>
              <td className="px-2 py-2">{e.what}</td>
              <td className="px-2 py-2">{expenseCode(trip.ent, e)}</td>
              <td className="px-2 py-2 text-center" style={{ color: e.needsDoc ? "#b45309" : b.accent }}>
                {e.needsDoc ? "⚠ missing" : "✓ receipt"}
              </td>
              <td className="py-2 pl-2 text-right tabular-nums">{money(e.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-700 font-bold">
            <td colSpan={4} className="py-2 text-right">Total</td>
            <td className="py-2 pl-2 text-right" style={{ color: b.navy }}>{money(trip.total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-6 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        Generated by the {b.full} agent system · receipts attached in the exported .zip · one QuickBooks vendor: {tripVendor(trip)}
      </p>
    </div>
  );
}

function Meta({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "basis-full" : ""}>
      <span className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{k}</span>
      {v}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  );
}
