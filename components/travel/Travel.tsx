"use client";

import { useState, useEffect, Fragment } from "react";
import {
  Printer,
  Download,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  FileText,
  Search,
  Plus,
  Pencil,
  CreditCard,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { tripVendor } from "@/lib/data/tripVendor";
import type { Trip, TripExpense, ItinItem, NeedsTripItem, ConfReviewItem, ConfReviewConf, Credit } from "@/lib/data/travel";
import { ENT, money, ACTIVE_ENTITIES } from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
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

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const todayISO = () => new Date().toISOString().slice(0, 10);

// Dates WITH the year. The stored `dates` string drops the year — ambiguous across the
// 2025/2026 span (Fort Benning 2025 was reading as 2026). Format from the ISO start/end
// (the source of truth); fall back to the stored string only when ISO is absent.
function tripDates(t: { start?: string; end?: string; dates?: string }): string {
  const s = (t.start || "").slice(0, 10);
  const e = (t.end || s).slice(0, 10);
  if (!s) return t.dates || "dates TBD";
  const sd = new Date(s + "T00:00"), ed = new Date(e + "T00:00"), yr = sd.getFullYear();
  const md = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;
  if (+sd === +ed) return `${md(sd)}, ${yr}`;
  if (sd.getMonth() === ed.getMonth()) return `${md(sd)}–${ed.getDate()}, ${yr}`;
  return `${md(sd)} – ${md(ed)}, ${yr}`;
}

// Per-trip rollup from the attributed invoices (the same payables rows the detail shows),
// so the list can answer "is this trip reconciled?": expense count, posted vs open, and
// missing receipts. `attn` = a PAST trip still has open expenses or a missing receipt.
function tripRollup(t: Trip) {
  const exps = t.exps || [];
  const posted = exps.filter((e) => e.status === "posted").length;
  // "Awaiting" = the operator already actioned it — accepted (routed to Payables) OR staged/approved
  // (posting to QB). It no longer needs review; it's just waiting on the QB post. (staged = approved.)
  const awaiting = exps.filter((e) => e.status === "accepted" || e.status === "staged").length;
  // "To review" = STILL needs an operator decision (open) or failed and needs a fix (error).
  const open = exps.filter((e) => e.status === "open" || e.status === "error").length;
  const missing = exps.filter((e) => e.needsDoc).length;
  const isPast = (t.end || "") < todayISO();
  return { count: exps.length, posted, awaiting, open, missing, isPast, attn: isPast && (open > 0 || missing > 0) };
}

export default function Travel({
  trips: initialTrips,
  needsTrip = [],
  credits = [],
}: {
  trips: Trip[];
  needsTrip?: NeedsTripItem[];
  credits?: Credit[];
}) {
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [search, setSearch] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [zipping, setZipping] = useState(false);
  // "Needs a trip" asks (unmatched travel@ itineraries) + which one a New-Trip is resolving.
  const [needs, setNeeds] = useState<NeedsTripItem[]>(needsTrip);
  const [prefill, setPrefill] = useState<{ dest: string; start: string; end: string; needsId: string } | null>(null);
  const { message, toast } = useToast();
  const router = useRouter();

  async function dismissNeeds(id: string) {
    setNeeds((n) => n.filter((x) => x.id !== id));
    try {
      await fetch("/api/travel/needs-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "dismissed" }),
      });
    } catch {
      /* best-effort */
    }
  }

  // Assign a 'needs a trip' itinerary to an EXISTING trip — the worker then populates that trip's
  // itinerary + stages any prepaid items on its next pass (records assigned_trip_id).
  async function assignNeeds(id: string, tripId: string) {
    if (!tripId) return;
    setNeeds((n) => n.filter((x) => x.id !== id));
    try {
      await fetch("/api/travel/needs-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tripId }),
      });
    } catch {
      /* best-effort */
    }
  }

  function createFromNeeds(item: NeedsTripItem) {
    setPrefill({ dest: item.destination, start: item.startDate ?? "", end: item.endDate ?? "", needsId: item.id });
    setNewTripOpen(true);
  }

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

  async function createTrip(t: Trip) {
    setTrips((prev) => [t, ...prev]); // optimistic
    setNewTripOpen(false);
    const resolvingNeedsId = prefill?.needsId ?? null;
    setPrefill(null);
    try {
      const res = await fetch("/api/travel/create-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ent: t.ent, dest: t.dest, start: t.start, end: t.end, purpose: t.purpose, travelers: t.travelers }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `failed (${res.status})`);
      // swap the temp local id for the persisted one so edits/attribution use the real id
      setTrips((prev) => prev.map((x) => (x.id === t.id ? { ...x, id: j.id } : x)));
      // if this trip was created to resolve a "needs a trip" ask, clear that ask
      if (resolvingNeedsId) {
        setNeeds((n) => n.filter((x) => x.id !== resolvingNeedsId));
        fetch("/api/travel/needs-trip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: resolvingNeedsId, status: "resolved" }),
        }).catch(() => {});
      }
      toast(`✓ Saved ${t.dest} — new invoices in this window will attribute to it`);
    } catch (e) {
      setTrips((prev) => prev.filter((x) => x.id !== t.id)); // revert — it didn't save
      toast(`Couldn't save trip: ${e instanceof Error ? e.message : "try again"}`);
    }
  }

  // Stage this trip's ready invoices for QuickBooks — reuses the payables batch
  // checkpoint (sets status=approved → backend post_runner posts under the trip vendor).
  // Travel ACCEPTS (review confirmation); Payables POSTS. Accept flips a trip's staged travel
  // expenses → accepted, which surfaces them in Payables for coding (pay-from card) + posting.
  async function acceptTrip(t: Trip) {
    const ids = t.exps.filter((e) => e.id && e.status === "staged").map((e) => e.id!);
    if (!ids.length) {
      toast("Nothing to accept — all reviewed");
      return;
    }
    try {
      const res = await fetch("/api/travel/accept-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: t.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "accept failed");
      toast(`✓ Accepted ${j.accepted} expense${j.accepted === 1 ? "" : "s"} — code & post in Payables`);
      router.refresh();
    } catch (e) {
      toast(`Couldn't accept: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {showCredits ? (
        <CreditsScreen credits={credits} trips={trips} onBack={() => setShowCredits(false)} toast={toast} />
      ) : openTrip ? (
        <TripDetail
          trip={openTrip}
          trips={trips}
          onBack={() => setOpenTripId(null)}
          onReport={() => setReportId(openTrip.id)}
          onZip={() => downloadZip(openTrip)}
          zipping={zipping}
          onAccept={() => acceptTrip(openTrip)}
          onEdit={() => setEditTrip(openTrip)}
        />
      ) : (
        <>
          <PageHeader
            title="Travel"
            subtitle="Trips and their attributed expenses. Invoices attribute to a trip in Payables; each trip rolls up to one QuickBooks vendor."
            action={
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setShowCredits(true)}>
                  <CreditCard className="h-4 w-4" /> Credits
                  {credits.length > 0 && (
                    <span className="ml-1 rounded-full bg-neutral-100 px-1.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {credits.filter((c) => c.status !== "exhausted").length}
                    </span>
                  )}
                </Button>
                <Button onClick={() => setNewTripOpen(true)}>
                  <Plus className="h-4 w-4" /> New trip
                </Button>
              </div>
            }
          />
          {needs.length > 0 && (
            <NeedsTripInbox items={needs} trips={trips} onCreate={createFromNeeds} onAssign={assignNeeds} onDismiss={dismissNeeds} />
          )}
          <TripsList
            trips={trips}
            search={search}
            setSearch={setSearch}
            onOpen={setOpenTripId}
          />
        </>
      )}

      {/* New trip */}
      <NewTripModal
        open={newTripOpen}
        onClose={() => { setNewTripOpen(false); setPrefill(null); }}
        onCreate={createTrip}
        initial={prefill ? { dest: prefill.dest, start: prefill.start, end: prefill.end } : undefined}
      />

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

// ---------- credits screen ----------
// eCredits, owned by the trip that issued them. `reimbursedOrigin` (As paid / As used) is the
// per-credit operator decision that drives drawdown-vs-full; here it's surfaced read-only.
function CreditsScreen({ credits, trips, onBack, toast }: { credits: Credit[]; trips: Trip[]; onBack: () => void; toast: (m: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Credit[]>(credits);
  useEffect(() => setRows(credits), [credits]);
  const tripName = (id: string) => trips.find((t) => t.id === id)?.dest ?? id;
  const bal = (c: Credit) => c.balanceRemaining ?? 0;
  // The operator's "as paid vs as used" decision — flips reimbursed_origin (drives drawdown-vs-full).
  // Optimistic; reverts on failure. Flag is independent of the balance, so amounts never change here.
  async function setMode(c: Credit, reimbursedOrigin: boolean) {
    setRows((rs) => rs.map((x) => (x.creditNumber === c.creditNumber ? { ...x, reimbursedOrigin } : x)));
    try {
      const res = await fetch("/api/travel/credit-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: c.sourceTripId, creditNumber: c.creditNumber, reimbursedOrigin }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "failed");
      toast(`✓ ${c.passenger} → expense cancelled trip: ${reimbursedOrigin ? "Yes" : "No"}`);
      router.refresh();
    } catch (e) {
      setRows((rs) => rs.map((x) => (x.creditNumber === c.creditNumber ? { ...x, reimbursedOrigin: !reimbursedOrigin } : x)));
      toast(`Couldn't update: ${(e as Error).message}`);
    }
  }
  const open = rows.filter((c) => c.status !== "exhausted");
  const outstanding = open.reduce((s, c) => s + bal(c), 0);
  const asPaid = open.filter((c) => c.reimbursedOrigin).reduce((s, c) => s + bal(c), 0);
  const asUsed = open.filter((c) => !c.reimbursedOrigin).reduce((s, c) => s + bal(c), 0);
  const cards: [string, number][] = [
    ["Outstanding", outstanding],
    ["Expensed — draws down future", asPaid],
    ["Not expensed — reimbursed on use", asUsed],
  ];
  return (
    <>
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
        <ChevronLeft className="h-4 w-4" /> Travel
      </button>
      <PageHeader title="Credits" subtitle="eCredits owned by the trip that issued them, drawn down as you use them on new trips." />
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No credits yet. They open when a trip is cancelled (the tickets become eCredits) or when a receipt applies one.</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {cards.map(([label, val]) => (
              <div key={label} className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-xl font-medium">{money(val)}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700">
                  <th className="py-2 pr-3 font-normal">Passenger</th>
                  <th className="px-3 py-2 font-normal">Document #</th>
                  <th className="px-3 py-2 font-normal">Expense cancelled trip?</th>
                  <th className="px-3 py-2 text-right font-normal">Original</th>
                  <th className="px-3 py-2 text-right font-normal">Current</th>
                  <th className="px-3 py-2 font-normal">From</th>
                  <th className="px-3 py-2 font-normal">Used on</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.creditNumber} className="border-b border-neutral-100 align-top dark:border-neutral-800">
                    <td className="py-2.5 pr-3">
                      {c.passenger}
                      <div className="text-xs text-neutral-400">{c.vendor}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-neutral-500">{c.creditNumber}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={c.reimbursedOrigin ? "yes" : "no"}
                        onChange={(e) => setMode(c, e.target.value === "yes")}
                        aria-label="Expense cancelled trip?"
                        className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${c.reimbursedOrigin ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}
                      >
                        <option value="yes">Yes — expensed</option>
                        <option value="no">No — hold</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right text-neutral-500">{c.originalAmount == null ? "—" : money(c.originalAmount)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{c.balanceRemaining == null ? "—" : money(c.balanceRemaining)}</td>
                    <td className="px-3 py-2.5">
                      {c.sourceTripName}
                      {c.status === "pending" && <div className="text-xs text-amber-600">amount pending</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.applications.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        c.applications.map((a, i) => (
                          <div key={i}>
                            {a.usedOnTripName || tripName(a.usedOnTripId)}
                            {a.confirmation ? ` · ${a.confirmation}` : ""}{" "}
                            <span className="text-neutral-500">−{money(a.amount)}</span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ---------- new trip modal ----------
function NewTripModal({
  open,
  onClose,
  onCreate,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (t: Trip) => void;
  initial?: { dest?: string; start?: string; end?: string };
}) {
  const [ent, setEnt] = useState("BC");
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [purpose, setPurpose] = useState("");
  const [travelers, setTravelers] = useState("");

  // Seed from a "needs a trip" ask when opened pre-filled (destination + dates).
  useEffect(() => {
    if (open && initial) {
      setDest(initial.dest ?? "");
      setStart(initial.start ?? "");
      setEnd(initial.end ?? "");
    }
  }, [open, initial]);

  const fmt = (d: string) =>
    d ? new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  function submit() {
    const dates = start || end ? `${fmt(start)}${end ? " – " + fmt(end) : ""}` : "dates TBD";
    const endISO = end || start;
    const travelerList = travelers.split(",").map((s) => s.trim()).filter(Boolean);
    onCreate({
      id: "new" + Date.now(),
      ent,
      dest: dest || "New destination",
      dates,
      start,
      end: endISO,
      status: endISO && endISO >= new Date().toISOString().slice(0, 10) ? "up" : "closed",
      purpose: purpose || undefined,
      travelers: travelerList.length ? travelerList : undefined,
      total: 0,
      itin: [],
      exps: [],
    });
    setEnt("BC"); setDest(""); setStart(""); setEnd(""); setPurpose(""); setTravelers("");
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
            {ACTIVE_ENTITIES.map((e) => (
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
        <Field label="Travelers (optional)">
          <input value={travelers} onChange={(e) => setTravelers(e.target.value)} placeholder="e.g. Jacob Wolbach, Jessica Davidson" className={INPUT} />
          <p className="mt-1 text-[11.5px] text-slate-400">Comma-separated. Pulled from the flights automatically — set here when there’s no flight, or to override.</p>
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
  const [travelers, setTravelers] = useState((trip.travelers ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const travelerList = travelers.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/travel/update-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trip.id, ent, dest, start, end, purpose, travelers: travelerList }),
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
        <Field label="Travelers">
          <input value={travelers} onChange={(e) => setTravelers(e.target.value)} placeholder="e.g. Jacob Wolbach, Jessica Davidson" className={INPUT} />
          <p className="mt-1 text-[11.5px] text-slate-400">Comma-separated. Pulled from the flights automatically — set here to override.</p>
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
type SortKey = "start" | "dest" | "ent" | "count" | "missing" | "total";

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
  const [stat, setStat] = useState<"ALL" | "up" | "past" | "attn">("ALL");
  const [sortK, setSortK] = useState<SortKey>("start");
  const [dir, setDir] = useState<1 | -1>(-1); // newest first by default
  const today = todayISO();

  const q = search.toLowerCase();
  const match = (t: Trip) => {
    if (ent !== "ALL" && t.ent !== ent) return false;
    const up = (t.end || "") >= today;
    if (stat === "up" && !up) return false;
    if (stat === "past" && up) return false;
    if (stat === "attn" && !tripRollup(t).attn) return false;
    if (q && !`${ENT[t.ent] ?? t.ent} ${t.dest} ${t.purpose ?? ""} ${tripDates(t)}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const sortVal = (t: Trip): string | number => {
    const r = tripRollup(t);
    switch (sortK) {
      case "dest": return t.dest.toLowerCase();
      case "ent": return (ENT[t.ent] ?? t.ent).toLowerCase();
      case "count": return r.count;
      case "missing": return r.missing;
      case "total": return t.total;
      default: return t.start || "";
    }
  };
  const cmp = (a: Trip, b: Trip) => {
    const x = sortVal(a), y = sortVal(b);
    return x < y ? -dir : x > y ? dir : 0;
  };

  const all = trips.filter(match);
  const upcoming = all.filter((t) => (t.end || "") >= today).sort((a, b) => (a.start < b.start ? -1 : 1));
  const past = all.filter((t) => (t.end || "") < today).sort(cmp);
  const showUpcoming = stat === "ALL" || stat === "up";
  const filtered = ent !== "ALL" || stat !== "ALL" || !!q;
  const shown = (showUpcoming ? upcoming.length : 0) + (stat === "up" ? 0 : past.length);

  // Summary across ALL trips (not just the filtered view) — the "where do I act?" numbers.
  const yr = String(new Date().getFullYear());
  const sum = trips.reduce(
    (a, t) => {
      const r = tripRollup(t);
      if ((t.start || "").startsWith(yr)) a.spend += t.total;
      if (r.open > 0) a.openTrips += 1;
      a.missing += r.missing;
      return a;
    },
    { spend: 0, openTrips: 0, missing: 0 },
  );

  function toggleSort(k: SortKey) {
    if (sortK === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortK(k); setDir(k === "dest" || k === "ent" ? 1 : -1); }
  }
  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 ${right ? "text-right" : "text-left"}`}
    >
      {label}
      <span className={sortK === k ? "ml-1 text-slate-600" : "ml-1 opacity-0"}>{dir < 0 ? "↓" : "↑"}</span>
    </th>
  );

  return (
    <div className="mt-4 space-y-4">
      {/* at-a-glance: answers "where do I need to act?" before the list */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat n={String(trips.length)} l="Trips" />
        <SummaryStat n={money(sum.spend)} l={`Travel spend · ${yr} YTD`} />
        <SummaryStat n={String(sum.openTrips)} l="Trips with open expenses" warn={sum.openTrips > 0} />
        <SummaryStat n={String(sum.missing)} l="Receipts missing" warn={sum.missing > 0} />
      </div>

      {/* toolbar: entity + status filters, search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All ACTIVE entities are selectable — not just the ones that happen to have trips. */}
        <select
          value={ent}
          onChange={(e) => setEnt(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700"
          aria-label="Filter by entity"
        >
          <option value="ALL">All entities</option>
          {ACTIVE_ENTITIES.map((e) => (
            <option key={e.code} value={e.code}>{e.label}</option>
          ))}
        </select>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {([["ALL", "All"], ["up", "Upcoming"], ["past", "Past"], ["attn", "Needs attention"]] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setStat(k)}
              className={`border-l border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold first:border-l-0 ${stat === k ? "bg-brand/10 text-brand-navy" : "bg-white text-slate-600 hover:text-brand-navy"}`}
            >
              {lbl}
            </button>
          ))}
        </div>
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
      <p className="text-[12px] text-slate-400">{filtered ? `${shown} of ${trips.length} trips` : `${trips.length} trips`}</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <SortTh k="dest" label="Trip" />
              <SortTh k="ent" label="Entity" />
              <SortTh k="start" label="Dates" />
              <SortTh k="count" label="Expenses" />
              <SortTh k="missing" label="Receipts" />
              <SortTh k="total" label="Amount" right />
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {showUpcoming && upcoming.length > 0 && (
              <>
                <GroupRow label={`Upcoming (${upcoming.length})`} />
                {upcoming.map((t) => <TripRow key={t.id} t={t} onOpen={onOpen} />)}
              </>
            )}
            {shown === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-sm text-slate-400">No matching trips.</td></tr>
            ) : (
              past.map((t, i) => {
                const ty = (t.start || "").slice(0, 4);
                const prevY = i > 0 ? (past[i - 1].start || "").slice(0, 4) : "";
                const showYr = sortK === "start" && !!ty && ty !== prevY;
                return (
                  <Fragment key={t.id}>
                    {showYr && <GroupRow label={ty} />}
                    <TripRow t={t} onOpen={onOpen} />
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NeedsTripInbox({
  items,
  trips,
  onCreate,
  onAssign,
  onDismiss,
}: {
  items: NeedsTripItem[];
  trips: Trip[];
  onCreate: (item: NeedsTripItem) => void;
  onAssign: (id: string, tripId: string) => void;
  onDismiss: (id: string) => void;
}) {
  // most-recent trips first — what an unmatched itinerary most likely belongs to
  const tripOpts = [...trips].sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
      <div className="border-b border-amber-200 px-4 py-2.5 text-[13px] font-semibold text-amber-900">
        Needs a trip — {items.length} itinerary{items.length === 1 ? "" : "s"} from travel@ didn’t match a trip
      </div>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3 border-b border-amber-100 px-4 py-2.5 last:border-0">
          <span className="text-lg">🧭</span>
          <div className="min-w-0 flex-1">
            {/* headline = destination when we have one, else the booking identity (vendor/type/
                conf) so a no-destination itinerary is still recognizable enough to assign */}
            <div className="truncate font-semibold text-slate-900">
              {it.destination && it.destination !== "—" ? it.destination : (it.summary || "Unidentified itinerary")}
            </div>
            <div className="truncate text-[12.5px] text-slate-500">
              {it.dates
                || (it.startDate ? `${it.startDate}${it.endDate && it.endDate !== it.startDate ? " – " + it.endDate : ""}` : "dates TBD")}
              {it.summary && it.destination && it.destination !== "—" ? ` · ${it.summary}` : ""}
              {it.sourceUrl
                ? <> · <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">view source ↗</a></>
                : null}
            </div>
          </div>
          {/* assign to an EXISTING trip (the common case — trips are created manually) */}
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) onAssign(it.id, e.target.value); }}
            className="max-w-[200px] rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700"
          >
            <option value="" disabled>Assign to trip…</option>
            {tripOpts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.dest}{t.dates ? ` · ${t.dates}` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => onCreate(it)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:border-slate-300"
          >
            New trip
          </button>
          <button
            onClick={() => onDismiss(it.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:border-slate-300"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr className="bg-slate-50/70">
      <td colSpan={7} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</td>
    </tr>
  );
}

function SummaryStat({ n, l, warn }: { n: string; l: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      <div className={`text-[19px] font-bold tabular-nums ${warn ? "text-amber-600" : "text-brand-navy"}`}>{n}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</div>
    </div>
  );
}

function TripRow({ t, onOpen }: { t: Trip; onOpen: (id: string) => void }) {
  const r = tripRollup(t);
  const upcoming = !r.isPast;
  return (
    <tr
      onClick={() => onOpen(t.id)}
      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand/[0.03]"
    >
      <td className={`px-4 py-3 ${r.attn ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"}`}>
        <div className="font-semibold text-slate-900">{t.dest}</div>
        <div className="text-[12px] text-slate-500">{t.purpose ?? "—"}</div>
      </td>
      <td className="px-4 py-3"><Badge tone="indigo">{ENT[t.ent] ?? t.ent}</Badge></td>
      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-600">{tripDates(t)}</td>
      <td className="px-4 py-3 text-[12.5px]">
        {r.count === 0 ? (
          <span className="text-slate-400">—</span>
        ) : r.open === 0 ? (
          // Nothing left to review — either all posted, or accepted/approved and awaiting the QB post.
          r.awaiting > 0 ? (
            <span className="text-slate-700"><b className="font-semibold">{r.count}</b> · {r.posted} posted · <span className="text-indigo-600">{r.awaiting} awaiting</span></span>
          ) : (
            <span className="text-slate-700"><b className="font-semibold">{r.count}</b> · <span className="text-emerald-600">all posted</span></span>
          )
        ) : (
          <span className="text-slate-700" title="Open the trip to review — accept the confirmations, then post in Payables">
            <b className="font-semibold">{r.count}</b> · {r.posted} posted{r.awaiting > 0 ? ` · ${r.awaiting} awaiting` : ""} · <span className="font-semibold text-amber-600">{r.open} to review</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-[12.5px]">
        {r.count === 0 ? (
          <span className="text-slate-400">—</span>
        ) : r.missing === 0 ? (
          <span className="font-semibold text-emerald-600">✓ on file</span>
        ) : (
          <span className="font-semibold text-amber-600">⚠ {r.missing} missing</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-[13px] font-semibold tabular-nums">
        {upcoming && t.total === 0 ? (
          <Badge tone="indigo">Upcoming</Badge>
        ) : t.total > 0 ? (
          money(t.total)
        ) : (
          <span className="text-slate-300">no expenses</span>
        )}
      </td>
      <td className="px-2 text-right text-slate-300">›</td>
    </tr>
  );
}

// ---------- confirmation review (accept the ITINERARY, not the invoice) ----------
function ReviewSection({ trip, trips }: { trip: Trip; trips: Trip[] }) {
  const router = useRouter();
  const { message, toast } = useToast();
  const [split, setSplit] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  // Decisions applied this session — hide those legs immediately (optimistic) so the operator
  // sees the click land even before the server refresh re-reads trips.confirmations.
  const [done, setDone] = useState<Set<string>>(new Set());
  const legKey = (g: ConfReviewItem) => g.confs.map((c) => `${c.conf}|${c.traveler}`).sort().join("·");
  // Only legs that still need a decision; once every conf is decided the item drops off.
  const items = (trip.confirmations ?? []).filter((g) =>
    !done.has(legKey(g)) && g.confs.some((c) => (c.status ?? "needs_review") === "needs_review"));
  const others = trips.filter((t) => t.id !== trip.id);

  async function act(action: string, targets: ConfReviewConf[], newTripId?: string, legKeyHide?: string) {
    setBusy(true);
    const LABEL: Record<string, string> = {
      accept_invoice: "Accepted → routed to Payables",
      accept_confirmation: "Accepted — holding for the invoice",
      reassign: "Moved to the selected trip",
      decline: "Declined",
    };
    try {
      const res = await fetch("/api/travel/review-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tripId: trip.id, newTripId,
          items: targets.map((c) => ({ conf: c.conf, traveler: c.traveler })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast(`Couldn't apply — ${j.error || res.status}`); return; }
      if (legKeyHide) setDone((d) => new Set(d).add(legKeyHide)); // optimistic hide
      const linked = (j.changed ?? 0) > 0;
      toast(linked ? `✓ ${LABEL[action]}` : `✓ ${LABEL[action]} · no expense linked yet (will match when it arrives)`);
      router.refresh();
    } catch {
      toast("Action failed — try again");
    } finally { setBusy(false); }
  }

  if (!items.length) return null;

  const Actions = ({ targets, legKeyHide }: { targets: ConfReviewConf[]; legKeyHide?: string }) => (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={busy} onClick={() => act("accept_invoice", targets, undefined, legKeyHide)}
        className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">✓ Accept invoice</button>
      <button disabled={busy} onClick={() => act("accept_confirmation", targets, undefined, legKeyHide)}
        className="rounded-md bg-indigo-50 px-2.5 py-1.5 text-[12px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">✓ Accept confirmation</button>
      <MoveTripSelect trips={others} disabled={busy} onPick={(id) => act("reassign", targets, id, legKeyHide)} />
      <button disabled={busy} onClick={() => { if (confirm("Remove this confirmation from the program?")) act("decline", targets, undefined, legKeyHide); }}
        className="rounded-md bg-rose-50 px-2.5 py-1.5 text-[12px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">✕ Decline</button>
    </div>
  );

  // The summary is now shown INLINE (schedule + fare below), so the only link is the full email
  // (the document of record for accounting).
  const Source = ({ c }: { c: ConfReviewConf }) => c.source_url
    ? <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-medium text-brand hover:underline">view source ↗</a>
    : <span className="text-[11.5px] text-slate-400">source pending</span>;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[13.5px] font-semibold">Review &amp; approve <span className="font-normal text-slate-400">· from travel@</span></div>
        <span className="text-[11.5px] text-slate-400">accept the itinerary, not the invoice</span>
      </div>
      {items.map((g) => {
        const isSplit = !!split[g.key];
        return (
          <div key={g.key} className="border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{g.route}{g.flights ? <span className="ml-1 font-normal text-slate-400">· {g.flights}</span> : null}</div>
                <div className="text-[12px] text-slate-500">{g.day}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {g.confs.length} confirmation{g.confs.length === 1 ? "" : "s"}{(g.pnr_count ?? 1) > 1 ? ` · ${g.pnr_count} PNRs` : ""}
                </span>
                {g.confs.length > 1 && (
                  <button onClick={() => setSplit((s) => ({ ...s, [g.key]: !s[g.key] }))}
                    className="text-[11.5px] font-medium text-brand hover:underline">{isSplit ? "Re-group" : "Split"}</button>
                )}
              </div>
            </div>
            {/* SCHEDULE — the summary, inline: each leg with times, so no link-click to review */}
            {g.segments && g.segments.length > 0 && (() => {
              // Show each leg's date when the trip spans more than one day, so a round trip's
              // return leg reads on its real day (e.g. Jul 1) instead of under the departure day.
              const multiDay = new Set(g.segments.map((s) => s.day).filter(Boolean)).size > 1;
              return (
                <div className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5">
                  {g.segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5 text-[12px] text-slate-600">
                      <span className="min-w-[88px] font-medium text-slate-700">{s.flight}</span>
                      <span className="min-w-0 truncate">{s.route}</span>
                      {multiDay && s.day && (
                        <span className="whitespace-nowrap text-slate-400">{s.day}</span>
                      )}
                      <span className="ml-auto whitespace-nowrap tabular-nums text-slate-400">{s.depart} – {s.arrive}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-slate-600">
              {g.confs.map((c, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span>✈ {c.traveler} <span className="text-slate-400">· conf {c.conf}</span></span>
                  {c.awaiting_invoice
                    ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">invoice after trip</span>
                    : <>
                        {c.net != null && <span className="tabular-nums text-slate-400">net {money(c.net)}</span>}
                        {c.credit != null && c.credit > 0 && <span className="tabular-nums text-emerald-600">eCredit {money(c.credit)}</span>}
                        {c.fare != null && <span className="font-semibold tabular-nums text-slate-700">reimburse {money(c.fare)}</span>}
                      </>}
                  <Source c={c} />
                </span>
              ))}
            </div>
            {isSplit ? (
              <div className="mt-2 flex flex-col gap-2 border-l-2 border-slate-100 pl-3">
                {g.confs.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-medium">{c.traveler}</span>
                    <Actions targets={[c]} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2"><Actions targets={g.confs} legKeyHide={legKey(g)} /></div>
            )}
          </div>
        );
      })}
      <Toast message={message} />
    </div>
  );
}

// ---------- searchable "move trip" picker (newest → oldest, type to filter) ----------
function MoveTripSelect({
  trips,
  disabled,
  onPick,
}: {
  trips: Trip[];
  disabled?: boolean;
  onPick: (tripId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // newest first (by ISO start), then filter by the typed query
  const opts = [...trips]
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""))
    .filter((t) => !q || `${ENT[t.ent] ?? t.ent} ${t.dest} ${t.purpose ?? ""} ${tripDates(t)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-600 disabled:opacity-50"
      >
        ↪ Move trip… <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="relative border-b border-slate-100 p-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trips…"
                className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2 text-[12.5px] focus:border-brand focus:outline-none" />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {opts.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-slate-400">No matching trips.</div>
              ) : opts.map((t) => (
                <button key={t.id} onClick={() => { setOpen(false); setQ(""); onPick(t.id); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-brand/[0.06]">
                  <span className="truncate font-medium text-slate-700">{t.dest}</span>
                  <span className="shrink-0 text-[11.5px] text-slate-400">{ENT[t.ent] ?? t.ent} · {tripDates(t)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- posted-only expenses ledger (the QuickBooks tie-out) ----------
type LedgerSort = "date" | "payee" | "account" | "payFrom" | "net" | "reimburse";
const acctLeaf = (s: string) => s.split(/\s*:\s*/).pop() || s;
function fmtMD(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00");
  return Number.isNaN(+d) ? "—" : `${d.getMonth() + 1}/${d.getDate()}`;
}

function TripExpensesLedger({ trip }: { trip: Trip }) {
  // Only expenses POSTED to QuickBooks appear — nothing shows until it's approved + posted in
  // Payables. Reimburse is a BC-only column (employer reimbursement); non-BC shows a single Amount.
  const posted = trip.exps.filter((e) => e.status === "posted");
  const accepted = trip.exps.filter((e) => e.status === "accepted" || e.status === "staged");
  const showReimburse = trip.ent === "BC";
  const total = trip.exps.reduce((s, e) => s + e.amount, 0);
  const reimburse = trip.exps.reduce((s, e) => s + (e.netReimbursement ?? e.reimbursementAmount ?? e.amount), 0);

  // Show the whole tie-out (posted + accepted/awaiting), not just posted — otherwise the ledger is
  // empty until QuickBooks posting runs. A status tag distinguishes posted vs awaiting.
  const display = trip.exps;
  const [sortK, setSortK] = useState<LedgerSort>("date");
  const [dir, setDir] = useState<1 | -1>(1);
  const router = useRouter();
  // "Not travel": detach a mis-attributed expense (e.g. a home dinner) → back to Payables. Reversible.
  async function notTravel(id: string, what: string) {
    if (!window.confirm(`Remove "${what}" from this trip and send it back to Payables? (Reversible — not deleted.)`)) return;
    try {
      const res = await fetch("/api/travel/not-travel", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "failed");
      router.refresh();
    } catch (e) {
      window.alert(`Couldn't remove: ${(e as Error).message}`);
    }
  }

  const val = (e: TripExpense): string | number => {
    switch (sortK) {
      case "payee": return (e.what ?? "").toLowerCase();
      case "account": return acctLeaf(expenseCode(trip.ent, e)).toLowerCase();
      case "payFrom": return (e.payFrom ?? "").toLowerCase();
      case "net": return e.amount;
      case "reimburse": return e.netReimbursement ?? e.reimbursementAmount ?? e.amount;
      default: return e.date ?? "";
    }
  };
  const rows = [...display].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  const toggleSort = (k: LedgerSort) => { if (sortK === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortK(k); setDir(k === "payee" || k === "account" || k === "payFrom" ? 1 : -1); } };
  const cols = 4 + (showReimburse ? 2 : 1) + 1; // date,payee,account,entity + (net[+reimburse]) + links

  const Th = ({ k, label, right }: { k: LedgerSort; label: string; right?: boolean }) => (
    <th onClick={() => toggleSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 ${right ? "text-right" : "text-left"} ${sortK === k ? "text-slate-700" : ""}`}>
      <span className="inline-flex items-center gap-0.5">{label}
        {sortK === k ? (dir > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[13.5px] font-semibold">Trip expenses <span className="font-normal text-slate-400">· the QuickBooks tie-out</span></div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-slate-500">
            {posted.length} posted{accepted.length > 0 ? ` · ${accepted.length} awaiting` : ""}{showReimburse ? ` · reimburse ${money(reimburse)}` : ` · ${money(total)}`}
          </span>
        </div>
      </div>

      {display.length === 0 ? (
        <div className="px-4 py-4 text-[12.5px] text-slate-400">
          No expenses yet — accept the confirmations above, then they appear here and post to QuickBooks in Payables.
        </div>
      ) : (
        <table className="w-full" style={{ tableLayout: "auto" }}>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="w-px px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-400" onClick={() => toggleSort("date")} role="button">
                <span className="inline-flex cursor-pointer items-center gap-0.5">Date {sortK === "date" ? (dir > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}</span>
              </th>
              <Th k="payee" label="Payee" />
              <Th k="account" label="Cat" />
              <th className="w-px px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Entity</th>
              <Th k="payFrom" label="Pay-from" />
              <Th k="net" label={showReimburse ? "Net" : "Amount"} right />
              {showReimburse && <Th k="reimburse" label="Reimburse" right />}
              <th className="w-px px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const id = e.id ?? "";
              const acct = acctLeaf(expenseCode(trip.ent, e)) || e.category || "—";
              const trav = (() => {
                const p = (e.traveler || "").trim().split(/\s+/).filter(Boolean);
                if (p.length < 2) return e.traveler || "";
                const last = p[p.length - 1];
                return `${p[0][0].toUpperCase()}. ${last[0].toUpperCase()}${last.slice(1).toLowerCase()}`;
              })();
              return (
                <Fragment key={id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 pt-2.5 text-[12.5px] text-slate-500">{fmtMD(e.date)}</td>
                    <td className="whitespace-nowrap px-2 pt-2.5">
                      <span className="font-medium">{e.what}{trav ? <span className="font-normal text-slate-400"> · {trav}</span> : null}</span>
                      {e.status === "posted" ? <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">posted</span>
                        : e.status === "error" ? <span className="ml-1.5 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">error</span>
                        : <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">awaiting post</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 pt-2.5 text-[12.5px] text-slate-600" title={expenseCode(trip.ent, e)}>{acct}</td>
                    <td className="px-2 pt-2.5"><Badge tone="indigo">{trip.ent}</Badge></td>
                    <td className="px-2 pt-2.5 text-[12.5px] text-slate-600">{e.payFrom ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 pt-2.5 text-right text-[12.5px] tabular-nums text-slate-600">{money(e.amount)}</td>
                    {showReimburse && (
                      <td className="whitespace-nowrap px-2 pt-2.5 text-right text-[12.5px] tabular-nums">
                        <span className="font-semibold">{money(e.netReimbursement ?? e.reimbursementAmount ?? e.amount)}</span>
                        {!!e.creditDrawdown && e.creditDrawdown > 0 && (
                          <div className="text-[10.5px] font-normal text-amber-600">−{money(e.creditDrawdown)} credit drawdown · gross {money(e.reimbursementAmount ?? e.amount)}</div>
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 pt-2.5 text-right">
                      {e.docUrl && (
                        <a href={e.docUrl} target="_blank" rel="noopener noreferrer" title="Open invoice" className="text-brand hover:text-brand-navy"><FileText className="inline h-4 w-4" /></a>
                      )}
                      {e.qbUrl && (
                        <a href={e.qbUrl} target="_blank" rel="noopener noreferrer" title={`Open in QuickBooks${e.qbRef ? ` · ${e.qbRef}` : ""}`} className="ml-2 text-brand hover:text-brand-navy"><ExternalLink className="inline h-4 w-4" /></a>
                      )}
                      {id && e.status !== "posted" && e.status !== "accepted" && (
                        <button onClick={() => notTravel(id, e.what)} title="Not travel — send back to Payables"
                          className="ml-2 align-middle text-slate-400 hover:text-rose-600"><X className="inline h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td />
                    <td colSpan={cols - 1} className="px-2 pb-2.5 text-[11.5px] leading-relaxed text-slate-500" style={{ wordBreak: "break-word" }}>
                      <span className="text-slate-400">QB vendor</span> {tripVendor(trip)}
                      {e.creditAmount && e.creditAmount > 0 ? <> · <span className="text-slate-400">eCredit</span> {money(e.creditAmount)} applied{e.creditNumber ? ` · #${e.creditNumber}` : ""}</> : null}
                      <br />
                      {e.memo ? <><span className="text-slate-400">Memo</span> {e.memo}</> : null}
                      {e.qbRef ? <> {e.memo ? "· " : ""}<span className="text-slate-400">QB txn</span> {e.qbRef}</> : null}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- trip detail ----------
function TripDetail({
  trip,
  trips,
  onBack,
  onReport,
  onZip,
  zipping,
  onAccept,
  onEdit,
}: {
  trip: Trip;
  trips: Trip[];
  onBack: () => void;
  onReport: () => void;
  onZip: () => void;
  zipping: boolean;
  onAccept: () => void;
  onEdit: () => void;
}) {
  const b = brandFor(trip.ent);
  const postedAmt = trip.exps.filter((e) => e.status === "posted").reduce((s, e) => s + e.amount, 0);
  // QB tie-out total = sum of the AMEX charges (e.amount), the amounts that post to QuickBooks — NOT
  // trip.total (which is now the FARES, for the spend headline). "Posted" + "Awaiting post" are QB
  // amounts, so they must use this, not the fare total.
  const qbTotal = trip.exps.reduce((s, e) => s + e.amount, 0);
  const withDoc = trip.exps.filter((e) => !e.needsDoc).length;
  // Reimbursement total = the trip COST (sum of each receipt's claim). Reissue chains are already
  // collapsed by the worker (only the final row carries the claim), so this never double-counts.
  const reimburseTotal = trip.exps.reduce((s, e) => s + (e.netReimbursement ?? e.reimbursementAmount ?? e.amount), 0);
  // "Needs receipt" gaps: an itinerary confirmation with no uploaded receipt yet. The confirmation
  // builds the schedule, never an expense — so these are computed (one per conf), not stored rows.
  const expConfs = new Set(trip.exps.map((e) => (e.confirmation ?? "").toUpperCase()).filter(Boolean));
  const needsReceipt: { conf: string; sub: string }[] = [];
  const seenConf = new Set<string>();
  for (const i of trip.itin) {
    const conf = (i.conf ?? "").toUpperCase();
    if (!conf || seenConf.has(conf) || expConfs.has(conf)) continue;
    seenConf.add(conf);
    needsReceipt.push({ conf: i.conf as string, sub: i.who || i.sub || "" });
  }
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
          <p className="mt-1 text-sm text-slate-500">{ENT[trip.ent] ?? trip.ent} · {tripDates(trip)}</p>
          {trip.travelers && trip.travelers.length > 0 && (
            <p className="mt-1 text-[13px] text-slate-500">✈ {trip.travelers.join(", ")}</p>
          )}
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
            <Button variant="secondary" size="sm" onClick={onZip} disabled={zipping}>
              <Download className="h-3.5 w-3.5" /> {zipping ? "Building…" : "Export (.zip)"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Exports as <b className="text-brand-navy">{b.mark}</b> branded report
          </p>
        </div>
      </div>

      {(trip.exps.length > 0 || needsReceipt.length > 0) && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat n={money(postedAmt)} l="Posted to QuickBooks" />
          <SummaryStat n={money(qbTotal - postedAmt)} l="Awaiting post" warn={qbTotal - postedAmt > 0} />
          <SummaryStat n={`${withDoc} / ${trip.exps.length + needsReceipt.length}`} l="Receipts on file" warn={withDoc < trip.exps.length + needsReceipt.length} />
          <SummaryStat n={money(reimburseTotal)} l={trip.ent === "BC" ? "Reimbursement" : "Trip total"} />
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-[13.5px] font-semibold">Itinerary — what’s scheduled</span>
          <span className="text-[11px] text-slate-400">✈ from confirmations</span>
        </div>
        {trip.itin.length ? (
          trip.itin.map((i: ItinItem, k) => {
            const prev = trip.itin[k - 1];
            const showDay = i.day && i.day !== prev?.day;
            return (
              <Fragment key={k}>
                {showDay && (
                  <div className="bg-white px-4 pt-2.5 pb-1 text-[11px] text-slate-400">{i.day}</div>
                )}
                <div className="flex items-center gap-3.5 border-b border-slate-100 px-4 py-3 last:border-0">
                  <span className="text-lg">{i.ic}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.title || i.what}</div>
                    {(i.sub || i.who || i.conf) && (
                      <div className="truncate text-[12.5px] text-slate-500">
                        {i.who ? `✈ ${i.who}` : i.sub}{i.conf ? `${i.who || i.sub ? " · " : ""}conf ${i.conf}` : ""}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-[12.5px] text-slate-500">{i.when}</span>
                </div>
              </Fragment>
            );
          })
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-slate-400">
            No itinerary yet — flight, hotel and car blocks appear here as confirmations arrive.
          </div>
        )}
      </div>

      <ReviewSection trip={trip} trips={trips} />

      <TripExpensesLedger trip={trip} />

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[13px] text-slate-600">
        Posts to QuickBooks under one vendor — <b className="text-brand-navy">{tripVendor(trip)}</b>. Each merchant is a memo line (with the traveler), never its own vendor.
        <span className="mt-1.5 block text-[12.5px] text-slate-500">
          The confirmation builds the <b>itinerary</b> and the review list above. Expenses here are the <b>QuickBooks tie-out</b> — each appears once it’s accepted and posted in Payables.
        </span>
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
            {/* footer must equal the column above (each row shows e.amount = the AMEX charge); trip.total
                is now the FARES total, so don't use it here. */}
            <td className="py-2 pl-2 text-right" style={{ color: b.navy }}>{money(trip.exps.reduce((s, e) => s + e.amount, 0))}</td>
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

