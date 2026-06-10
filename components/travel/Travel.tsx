"use client";

import { useState } from "react";
import { Printer, Download, ChevronLeft, FileText, Search } from "lucide-react";
import type { Trip, QueueExpense } from "@/lib/data/travel";
import { ENT, money } from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import FilterTabs from "@/components/ui/FilterTabs";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const BRANDS = {
  BC: { mark: "BCX", full: "Builders Capital", font: "'Roboto',Arial,sans-serif", navy: "#10102e", accent: "#177245", accent2: "#7bbf43" },
  _def: { mark: "Foundry", full: "Foundry Capital", font: "inherit", navy: "#0a2c4e", accent: "#1768a3", accent2: "#5ba3d2" },
};
const brandFor = (ent: string) => (ent === "BC" ? BRANDS.BC : BRANDS._def);

export default function Travel({ trips, queue }: { trips: Trip[]; queue: QueueExpense[] }) {
  const [view, setView] = useState("queue");
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [conf, setConf] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const { message, toast } = useToast();

  const openTrip = trips.find((t) => t.id === openTripId) || null;
  const reportTrip = trips.find((t) => t.id === reportId) || null;
  const pending = queue.filter((q) => !done[q.id]);

  function confirmAll() {
    const next = { ...done };
    queue.forEach((q) => {
      const checked = q.id in conf ? conf[q.id] : q.suggested;
      if (checked && !q.home) next[q.id] = "→ " + q.trip;
    });
    setDone(next);
    toast("✓ Confirmed all suggested trip expenses");
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {openTrip ? (
        <TripDetail
          trip={openTrip}
          onBack={() => setOpenTripId(null)}
          onReport={() => setReportId(openTrip.id)}
        />
      ) : (
        <>
          <PageHeader
            title="Travel"
            subtitle="Trip expense attribution — confirm what the agent suggests; only date-overlaps need you."
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
              setConf={setConf}
              onConfirmAll={confirmAll}
              onChange={() => toast("Pick a different trip — full reassign drawer coming soon")}
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
              onClick={() => {
                if (reportTrip) toast(`Exporting ${reportTrip.dest} as a ${brandFor(reportTrip.ent).mark}-branded .zip`);
              }}
            >
              Download .zip
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
  setConf,
  onConfirmAll,
  onChange,
}: {
  queue: QueueExpense[];
  conf: Record<string, boolean>;
  done: Record<string, string>;
  setConf: (fn: (c: Record<string, boolean>) => Record<string, boolean>) => void;
  onConfirmAll: () => void;
  onChange: (id: string) => void;
}) {
  const pending = queue.filter((q) => !q.home && !done[q.id]).length;
  return (
    <>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        ✓ Itineraries auto-tie to the matching trip. You’re only asked when a date{" "}
        <b>overlaps two trips</b>. Auto-coded trip expenses post silently — confirm the suggestions
        below.
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Trip expenses to confirm</h2>
            <p className="text-[12.5px] text-slate-500">{pending} suggested · 1 home → Payables</p>
          </div>
          <Button variant="success" onClick={onConfirmAll}>✓ Confirm all</Button>
        </div>
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
            <div key={q.id} className={`grid grid-cols-[34px_28px_2fr_1.5fr_1.7fr] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 ${q.home ? "bg-slate-50/60" : ""}`}>
              <button
                onClick={() => setConf((c) => ({ ...c, [q.id]: !(q.id in c ? c[q.id] : q.suggested) }))}
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
                  {q.sub} · <span className="cursor-pointer text-brand">📄 view</span>
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
                <button onClick={() => onChange(q.id)} className="text-xs font-semibold text-brand">change</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
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
  const open = trips.filter((t) => t.status === "open");
  const up = trips.filter((t) => t.status === "up");
  const past = trips.filter((t) => t.status === "closed");
  const q = search.toLowerCase();
  const pastFiltered = past.filter(
    (t) => !q || `${ENT[t.ent]} ${t.dest} ${t.purpose ?? ""} ${t.dates}`.toLowerCase().includes(q),
  );

  return (
    <div className="mt-4 space-y-6">
      <Group label="Open for expenses">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((t) => <TripCard key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      </Group>
      <Group label="Upcoming">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {up.map((t) => <TripCard key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      </Group>
      <Group label={`Past trips (${past.length})`}>
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search past trips — destination, entity, purpose…"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {pastFiltered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">No matching trips.</div>
          ) : (
            pastFiltered.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="grid w-full grid-cols-[150px_1fr_110px_110px] items-center gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-brand/[0.03]"
              >
                <Badge tone="indigo">{ENT[t.ent]}</Badge>
                <div>
                  <div className="font-semibold text-slate-900">{t.dest}</div>
                  <div className="text-[12.5px] text-slate-500">{t.purpose ?? "—"}</div>
                </div>
                <div className="text-[12.5px] text-slate-500">{t.dates}</div>
                <div className="text-right font-semibold tabular-nums">{money(t.total)}</div>
              </button>
            ))
          )}
        </div>
      </Group>
    </div>
  );
}

function TripCard({ t, onOpen }: { t: Trip; onOpen: (id: string) => void }) {
  const border = t.status === "closed" ? "border-l-slate-400" : t.status === "up" ? "border-l-brand-sky" : "border-l-brand";
  return (
    <button
      onClick={() => onOpen(t.id)}
      className={`rounded-xl border border-slate-200 border-l-4 ${border} bg-white p-4 text-left shadow-sm transition hover:shadow-md`}
    >
      <Badge tone="indigo">{ENT[t.ent]}</Badge>
      <div className="mt-2 text-[15px] font-semibold text-slate-900">{t.dest}</div>
      <div className="text-[12.5px] text-slate-500">
        {t.dates}
        {t.grace ? ` · ${t.grace}` : ""}
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        {t.status === "open" ? (
          <span className="font-semibold text-emerald-600">● open for expenses</span>
        ) : t.status === "up" ? (
          <span>{t.itin.length} bookings</span>
        ) : (
          <span>closed</span>
        )}
        <span>{t.status === "up" ? "upcoming" : money(t.total)}</span>
      </div>
    </button>
  );
}

// ---------- trip detail ----------
function TripDetail({ trip, onBack, onReport }: { trip: Trip; onBack: () => void; onReport: () => void }) {
  const b = brandFor(trip.ent);
  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft className="h-4 w-4" /> Trips
      </button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-brand-navy">{trip.dest}</h1>
          <p className="mt-1 text-sm text-slate-500">{ENT[trip.ent]} · {trip.dates}</p>
          <p className="mt-2 text-[13.5px]">
            <span className="mr-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Purpose</span>
            {trip.purpose ?? "— (add one)"}
          </p>
        </div>
        <div className="text-right">
          <Badge tone={trip.status === "open" ? "green" : trip.status === "up" ? "indigo" : "neutral"} dot>
            {trip.status === "open" ? "Open for expenses" : trip.status === "up" ? "Upcoming" : "Closed"}
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
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-[13.5px] font-semibold">
          <span>Trip expenses ({trip.exps.length})</span>
          <span>{money(trip.total)}</span>
        </div>
        {trip.exps.length ? (
          trip.exps.map((e, k) => (
            <div key={k} className="flex items-center gap-3.5 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="text-lg">{e.ic}</span>
              <div className="flex-1">
                <div className="font-medium">{e.what}</div>
                <div className="text-[12.5px] text-slate-500">
                  {e.gl} · <span className="inline-flex items-center gap-0.5 text-brand"><FileText className="h-3 w-3" /> view</span>
                </div>
              </div>
              <span className="font-semibold tabular-nums">{money(e.amount)}</span>
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-[12.5px] text-slate-400">No expenses attributed yet.</div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[13px] text-slate-600">
        Posts to QuickBooks under one vendor — <b className="text-brand-navy">Travel {trip.dates} — {ENT[trip.ent]} {trip.dest}</b>. Each merchant is a memo line, never its own vendor.
      </div>
    </div>
  );
}

// ---------- branded report sheet ----------
function BrandedReport({ trip }: { trip: Trip }) {
  const b = brandFor(trip.ent);
  return (
    <div className="print-sheet" style={{ fontFamily: b.font, color: "#1f2937" }}>
      <div className="flex items-center justify-between px-2 py-4" style={{ background: b.navy, borderBottom: `5px solid ${b.accent2}`, color: "#fff", margin: "-1.25rem -1.5rem 1.25rem", paddingLeft: "1.5rem", paddingRight: "1.5rem" }}>
        <div className="text-2xl font-extrabold tracking-wide">
          {b.mark === "BCX" ? <span><span style={{ color: b.accent2 }}>B</span>CX</span> : "Foundry"}
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
            <th className="border-b-2 border-current py-1.5 px-2 text-left text-[10.5px] font-bold uppercase tracking-wide">GL account</th>
            <th className="border-b-2 border-current py-1.5 px-2 text-center text-[10.5px] font-bold uppercase tracking-wide">Documentation</th>
            <th className="border-b-2 border-current py-1.5 pl-2 text-right text-[10.5px] font-bold uppercase tracking-wide">Amount</th>
          </tr>
        </thead>
        <tbody>
          {trip.exps.map((e, k) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="py-2 pr-2">{e.sub.includes("·") ? e.sub.split("·").pop()!.trim() : trip.dates}</td>
              <td className="px-2 py-2">{e.what}</td>
              <td className="px-2 py-2">{e.gl}</td>
              <td className="px-2 py-2 text-center" style={{ color: b.accent }}>✓ receipt</td>
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
        Generated by the {b.full} agent system · receipts attached in the exported .zip · one QuickBooks vendor: Travel {trip.dates} — {ENT[trip.ent]} {trip.dest}
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
