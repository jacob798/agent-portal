"use client";

import { useMemo, useState } from "react";
import { Toast, useToast } from "@/components/ui/Toast";
import type { IngestException, IngestExceptionKind, TripOption, Counts } from "@/lib/data/ingestExceptions";

type Filter = "all" | IngestExceptionKind;

const BADGE: Record<IngestExceptionKind, { label: string; cls: string }> = {
  path: { label: "Needs a path", cls: "bg-violet-50 text-violet-700" },
  divergence: { label: "Wrong doc type", cls: "bg-orange-50 text-orange-700" },
  trip: { label: "No trip match", cls: "bg-amber-50 text-amber-700" },
  ocr: { label: "Unreadable", cls: "bg-red-50 text-red-700" },
  fetch: { label: "Fetch needed", cls: "bg-sky-50 text-sky-700" },
};
const ICON: Record<IngestExceptionKind, string> = { path: "🧭", divergence: "🔀", trip: "🧳", ocr: "🖼️", fetch: "📥" };

/** "h6.hilton.com" → "Hilton", "uber.com" → "Uber" — a sensible default vendor name to pre-fill. */
function domainToName(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? domain;
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : domain;
}

export default function IngestExceptions({
  items,
  counts,
  docTypes,
  trips,
}: {
  items: IngestException[];
  counts: Counts;
  docTypes: Record<string, string[]>;
  trips: TripOption[];
}) {
  const { message, toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  // per-row form state for the "add vendor path" panel
  const [form, setForm] = useState<Record<string, { vendor: string; pipeline: string; docType: string }>>({});

  const live = useMemo(() => items.filter((i) => !resolved[i.id]), [items, resolved]);
  const shown = useMemo(
    () => items.filter((i) => filter === "all" || i.kind === filter),
    [items, filter],
  );
  const liveCounts = useMemo(() => {
    const k = (kind: IngestExceptionKind) => live.filter((i) => i.kind === kind).length;
    return { total: live.length, path: k("path"), divergence: k("divergence"), trip: k("trip"), ocr: k("ocr"), fetch: k("fetch") };
  }, [live]);

  function formFor(it: IngestException) {
    return (
      form[it.id] ?? {
        vendor: it.domain ? domainToName(it.domain) : "",
        pipeline: it.guessedPipeline === "travel" || it.guessedPipeline === "payables" ? it.guessedPipeline : "",
        docType: "",
      }
    );
  }
  function setFormFor(id: string, patch: Partial<{ vendor: string; pipeline: string; docType: string }>) {
    setForm((f) => ({ ...f, [id]: { ...formFor(items.find((i) => i.id === id)!), ...f[id], ...patch } }));
  }

  async function addVendorPath(it: IngestException) {
    const f = formFor(it);
    if (!f.vendor.trim() || (f.pipeline !== "travel" && f.pipeline !== "payables")) {
      toast("Pick a pathway and a vendor name first");
      return;
    }
    try {
      const res = await fetch("/api/ingest-exceptions/add-vendor-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor: f.vendor.trim(), domain: it.domain, pipeline: f.pipeline, doc_type: f.docType || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setResolved((r) => ({ ...r, [it.id]: `Path added → ${f.pipeline} (learned)` }));
      setOpenId(null);
      toast(`✓ ${f.vendor.trim()} → ${f.pipeline}. Future mail from ${it.domain} routes itself.`);
    } catch (e) {
      toast(`Add path failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function resolveTrip(it: IngestException, tripId: string | null, label: string) {
    const id = it.id.replace(/^trip:/, "");
    try {
      const res = await fetch("/api/travel/needs-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tripId ? { id, tripId } : { id, status: "dismissed" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setResolved((r) => ({ ...r, [it.id]: label }));
      setOpenId(null);
      toast(`✓ ${label}`);
    } catch (e) {
      toast(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function retryOcr(it: IngestException) {
    const id = it.id.replace(/^ocr:/, "");
    try {
      const res = await fetch("/api/ingest/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setResolved((r) => ({ ...r, [it.id]: "↻ Re-queued for processing" }));
      setOpenId(null);
      toast("↻ Re-queued — will re-run OCR + routing");
    } catch (e) {
      toast(`Retry failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function learnDocRule(it: IngestException, pipeline: "travel" | "payables") {
    try {
      const res = await fetch("/api/ingest-exceptions/learn-doc-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor: it.vendor, pipeline }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setResolved((r) => ({ ...r, [it.id]: `Rule learned → ${pipeline}` }));
      setOpenId(null);
      toast(`✓ ${it.vendor}: invoices → ${pipeline}. Won't flag again.`);
    } catch (e) {
      toast(`Learn rule failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  function markFetchHandled(it: IngestException) {
    // No fetch producer/resolution store yet — clear it from the local view only and tell the truth.
    setResolved((r) => ({ ...r, [it.id]: "Dismissed" }));
    setOpenId(null);
    toast("Dismissed for now (fetch retry not yet wired)");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-7 text-[#0a2c4e]">
      <h1 className="text-[22px] font-semibold">Ingest@ — Exception report</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Everything <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12.5px]">intake@</code> couldn&apos;t{" "}
        <b>route</b> on its own. The one decision here is <b>which pathway a document takes — Payables or Travel</b>.
        Answering it <b>adds a path to the vendor</b>, so the next document routes itself. Coding-stage problems
        (duplicates, split GL, currency, missing docs, receipt-vs-bill) are handled later on the payables surface,
        not here.
      </p>

      <div className="mb-4 rounded-[10px] border border-[#cfe0fb] bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-900">
        ▶ This is the <b>front door</b>. A vendor with a known path flows straight through and never appears here —
        these are the ones that still need a decision. Fix each in place; your answer is remembered.
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Stat n={liveCounts.total} l="need you" />
        <Stat n={liveCounts.path} l="need a path" />
        <Stat n={liveCounts.divergence} l="wrong doc type" />
        <Stat n={liveCounts.trip} l="no trip" />
        <Stat n={liveCounts.ocr} l="unreadable" />
        <Stat n={liveCounts.fetch} l="fetch needed" />
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2">
        {([
          ["all", `All ${counts.total}`],
          ["path", "Need a path"],
          ["divergence", "Wrong doc type"],
          ["trip", "No trip match"],
          ["ocr", "Unreadable"],
          ["fetch", "Fetch needed"],
        ] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${
              filter === f ? "border-[#0a2c4e] bg-[#0a2c4e] text-white" : "border-slate-200 bg-white text-[#0a2c4e]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Nothing here — every document intake@ saw routed cleanly. New unknown vendors and unmatched
            confirmations will appear here as they arrive.
          </div>
        ) : (
          shown.map((it) => {
            const b = BADGE[it.kind];
            const isOpen = openId === it.id;
            const done = resolved[it.id];
            return (
              <div key={it.id} className="border-b border-slate-200 last:border-b-0">
                <div className="grid grid-cols-[40px_1fr_150px_120px] items-center gap-3.5 px-5 py-3.5">
                  <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-slate-50 text-[17px]">
                    {ICON[it.kind]}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{it.who}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-slate-500">{it.detail}</div>
                  </div>
                  <div>
                    <span className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="flex justify-end">
                    {done ? (
                      <span className="text-[13px] font-semibold text-emerald-600">✓ {done}</span>
                    ) : (
                      <button
                        onClick={() => setOpenId(isOpen ? null : it.id)}
                        className="rounded-lg border border-[#0a2c4e] bg-[#0a2c4e] px-3 py-1.5 text-[12.5px] text-white"
                      >
                        Fix {isOpen ? "▴" : "▾"}
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && !done && (
                  <div className="border-t border-slate-200 bg-slate-50 px-5 py-3.5">
                    {it.kind === "path" && <PathPanel it={it} f={formFor(it)} setF={(p) => setFormFor(it.id, p)} docTypes={docTypes} onSave={() => addVendorPath(it)} />}
                    {it.kind === "divergence" && <DivergencePanel it={it} onConfirm={() => learnDocRule(it, "payables")} onTravel={() => learnDocRule(it, "travel")} />}
                    {it.kind === "trip" && <TripPanel trips={trips} onAssign={(t, l) => resolveTrip(it, t, l)} onDecline={() => resolveTrip(it, null, "Declined (archived)")} />}
                    {it.kind === "ocr" && <OcrPanel it={it} f={formFor(it)} setF={(p) => setFormFor(it.id, p)} docTypes={docTypes} onRetry={() => retryOcr(it)} onSave={() => addVendorPath(it)} />}
                    {it.kind === "fetch" && <FetchPanel onDismiss={() => markFetchHandled(it)} />}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <Toast message={message} />
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="min-w-[120px] rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs text-slate-500">{l}</div>
    </div>
  );
}

function PathwayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2.5 flex gap-2.5">
      {[
        ["payables", "📄 Payables"],
        ["travel", "✈️ Travel"],
      ].map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[9px] border-[1.5px] px-3 py-2 text-center font-semibold ${
            value === v ? "border-[#0a2c4e] bg-[#0a2c4e] text-white" : "border-slate-200 bg-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type F = { vendor: string; pipeline: string; docType: string };

function PathPanel({
  it,
  f,
  setF,
  docTypes,
  onSave,
}: {
  it: IngestException;
  f: F;
  setF: (p: Partial<F>) => void;
  docTypes: Record<string, string[]>;
  onSave: () => void;
}) {
  return (
    <div>
      <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        Which pathway? This adds a path to <b>{it.domain}</b> for every future email.
      </h4>
      <Field label="Vendor">
        <input value={f.vendor} onChange={(e) => setF({ vendor: e.target.value })} className="field" placeholder="Vendor name" />
      </Field>
      <PathwayPicker value={f.pipeline} onChange={(v) => setF({ pipeline: v, docType: "" })} />
      <Field label="Document type">
        <select value={f.docType} onChange={(e) => setF({ docType: e.target.value })} className="field" disabled={!f.pipeline}>
          <option value="">{f.pipeline ? "— optional: pin the type —" : "— pick a pathway first —"}</option>
          {(docTypes[f.pipeline] ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Field>
      <button onClick={onSave} className="mt-2 rounded-lg border border-[#0a2c4e] bg-[#0a2c4e] px-3 py-1.5 text-[12.5px] text-white">
        Add vendor path
      </button>
      <style jsx>{`
        .field {
          width: 100%;
          border: 1px solid #e3e8ef;
          border-radius: 7px;
          padding: 6px 9px;
          font-size: 13px;
          background: #fff;
        }
      `}</style>
    </div>
  );
}

function DivergencePanel({
  it,
  onConfirm,
  onTravel,
}: {
  it: IngestException;
  onConfirm: () => void;
  onTravel: () => void;
}) {
  return (
    <div>
      <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        <b>{it.vendor}</b> is learned as a travel vendor, but this looks like an invoice. It&apos;s already
        routed to payables — confirm so it stops flagging, or send it to travel if that&apos;s wrong.
      </h4>
      <div className="flex flex-wrap gap-2">
        <button onClick={onConfirm} className="rounded-lg border border-[#0a2c4e] bg-[#0a2c4e] px-3 py-1.5 text-[12.5px] text-white">
          ✓ Yes — invoices → payables
        </button>
        <button onClick={onTravel} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px]">
          Actually travel
        </button>
      </div>
    </div>
  );
}

function FetchPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div>
      <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        This email points to a document (a statement/invoice behind a portal link) we still need to pull.
        Automatic fetch isn&apos;t wired yet — grab it manually and upload via Payables, or dismiss.
      </h4>
      <div className="flex flex-wrap gap-2">
        <a href="/payables" className="rounded-lg border border-[#0a2c4e] bg-white px-3 py-1.5 text-[12.5px] text-[#0a2c4e]">
          ⤒ Upload the document
        </a>
        <button onClick={onDismiss} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px]">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TripPanel({
  trips,
  onAssign,
  onDecline,
}: {
  trips: TripOption[];
  onAssign: (tripId: string, label: string) => void;
  onDecline: () => void;
}) {
  // Trips are 100% manual; this surface attaches the confirmation to an existing trip (it never
  // creates one) or declines it. Assigning records assigned_trip_id → the worker drain attaches the
  // booking + stages any prepaid expense.
  const [tripId, setTripId] = useState("");
  const selected = trips.find((t) => t.id === tripId);
  return (
    <div>
      <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Attach to a trip</h4>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className="min-w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
        >
          <option value="">{trips.length ? "— pick a trip —" : "no open trips"}</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button
          disabled={!tripId}
          onClick={() => selected && onAssign(selected.id, `Attached to ${selected.label}`)}
          className="rounded-lg border border-[#0a2c4e] bg-[#0a2c4e] px-3 py-1.5 text-[12.5px] text-white disabled:opacity-40"
        >
          Attach
        </button>
        <a href="/travel" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] hover:border-[#0a2c4e]">
          New trip in Travel →
        </a>
        <button onClick={onDecline} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] hover:border-[#0a2c4e]">
          Not a trip — decline
        </button>
      </div>
    </div>
  );
}

function OcrPanel({
  it,
  f,
  setF,
  docTypes,
  onRetry,
  onSave,
}: {
  it: IngestException;
  f: F;
  setF: (p: Partial<F>) => void;
  docTypes: Record<string, string[]>;
  onRetry: () => void;
  onSave: () => void;
}) {
  return (
    <div>
      <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        Couldn&apos;t read this document. Re-run OCR, re-upload a clean copy, or tell it the pathway by hand.
      </h4>
      <div className="mb-3 flex gap-2">
        <button onClick={onRetry} className="rounded-lg border border-[#0a2c4e] bg-white px-3 py-1.5 text-[12.5px] text-[#0a2c4e]">
          ↻ Retry OCR
        </button>
        <a href="/payables" className="rounded-lg border border-[#0a2c4e] bg-white px-3 py-1.5 text-[12.5px] text-[#0a2c4e]">
          ⤒ Re-upload
        </a>
      </div>
      <div className="border-t border-dashed border-slate-200 pt-3">
        <PathwayPicker value={f.pipeline} onChange={(v) => setF({ pipeline: v, docType: "" })} />
        <Field label="Document type">
          <select value={f.docType} onChange={(e) => setF({ docType: e.target.value })} className="field2" disabled={!f.pipeline}>
            <option value="">{f.pipeline ? "— optional —" : "— pick a pathway first —"}</option>
            {(docTypes[f.pipeline] ?? []).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Vendor">
          <input value={f.vendor} onChange={(e) => setF({ vendor: e.target.value })} className="field2" placeholder="Vendor name" />
        </Field>
        <button onClick={onSave} className="mt-2 rounded-lg border border-[#0a2c4e] bg-[#0a2c4e] px-3 py-1.5 text-[12.5px] text-white">
          Save pathway &amp; route
        </button>
      </div>
      <style jsx>{`
        .field2 {
          width: 100%;
          border: 1px solid #e3e8ef;
          border-radius: 7px;
          padding: 6px 9px;
          font-size: 13px;
          background: #fff;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <label className="w-[120px] text-[12.5px] text-slate-500">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
