"use client";

import { useMemo, useState } from "react";
import { Zap, Upload, FileText, Plane } from "lucide-react";
import type { PayableRow } from "@/lib/data/payables";
import { ENTITIES, entName, ACCTS, GLS, money } from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import FilterTabs from "@/components/ui/FilterTabs";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import { Toast, useToast } from "@/components/ui/Toast";

type Row = PayableRow & {
  resolved?: boolean;
  resolvedTo?: string;
  doc_waived?: boolean;
};

const OPEN_TRIPS = ["Builders Capital · Denver", "Foundry Capital · Seattle"];
const missingDoc = (r: Row) => !!r.nodoc && !r.doc_waived;

export default function Payables({ initial }: { initial: PayableRow[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [filter, setFilter] = useState("need");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [travelRow, setTravelRow] = useState<string | null>(null);
  const [learnId, setLearnId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const { message, toast } = useToast();

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const counts = useMemo(() => {
    const need = rows.filter((r) => !r.auto && !r.resolved).length;
    const docs = rows.filter(missingDoc).length;
    const auto = rows.filter((r) => r.auto || r.resolved).length;
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { need, docs, auto, total };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "auto") return r.auto || r.resolved;
    if (filter === "docs") return missingDoc(r);
    return !r.auto && !r.resolved; // need
  });

  const drawerRow = rows.find((r) => r.id === drawerId) || null;
  const learnRow = rows.find((r) => r.id === learnId) || null;

  // ---- resolution actions ----
  function resolveEntity(id: string, code: string) {
    patch(id, { resolved: true, auto: true, entity: code, resolvedTo: "→ " + code });
  }
  function resolveSimple(id: string, label: string) {
    patch(id, { resolved: true, auto: true, resolvedTo: label });
  }
  function travelTo(id: string, label: string) {
    setTravelRow(null);
    patch(id, { resolved: true, auto: true, resolvedTo: label });
    setDrawerId(null);
  }
  function confirmLearn() {
    if (!learnRow) return;
    const entity =
      (document.getElementById("lv-entity") as HTMLSelectElement)?.value ||
      learnRow.entity ||
      learnRow.recommended ||
      "BC";
    const same = rows.filter((r) => r.vendor === learnRow.vendor && !r.resolved && !r.auto);
    setRows((rs) =>
      rs.map((r) =>
        r.vendor === learnRow.vendor && !r.resolved && !r.auto
          ? { ...r, resolved: true, auto: true, entity, resolvedTo: "(vendor learned)" }
          : r,
      ),
    );
    setLearnId(null);
    toast(
      `✓ Saved ${learnRow.vendor} → ${entName(entity)} · QB vendor created · Outlook contact added · ${same.length} invoice${same.length > 1 ? "s" : ""} coded`,
    );
  }
  function resolveDoc(id: string, how: "attach" | "waive") {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    if (how === "attach") {
      patch(id, { nodoc: false });
      toast(`📎 Receipt attached to ${r.vendor} — documentation gap cleared`);
    } else {
      patch(id, { doc_waived: true });
      toast(`Marked ${r.vendor} “no receipt needed” — expense still posts accurately`);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="Payables"
        subtitle="Exception queue — you only touch what the agent can't resolve confidently."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toast("Plaid: pulling new transactions… +14 new")}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <Zap className="h-4 w-4" /> Get from Plaid
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-brand-navy transition hover:border-brand hover:bg-brand/5"
            >
              <Upload className="h-4 w-4" /> Upload CSV / QBO
            </button>
            <button
              onClick={() => setShowInvoices(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-brand-navy transition hover:border-brand hover:bg-brand/5"
            >
              <FileText className="h-4 w-4" /> Upload invoices
            </button>
          </div>
        }
      />

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        🧳 <b>12</b> travel charges that landed inside a trip window were routed to Travel.
        Meals/rides <b>not</b> in a trip window stay here as payables.
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Stat label="Need you" value={counts.need} tone="amber" />
        <Stat label="Missing docs" value={counts.docs} tone="amber" />
        <Stat label="Auto-coded ✓" value={counts.auto} tone="green" />
        <Stat label="Total staged" value={money(counts.total)} tone="navy" />
      </div>

      <div className="mt-5">
        <FilterTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: "need", label: "Need you", count: counts.need },
            { key: "docs", label: "Missing docs", count: counts.docs },
            { key: "all", label: "All", count: rows.length },
            { key: "auto", label: "Auto-coded", count: counts.auto },
          ]}
        />
      </div>

      {/* Queue */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[16px_2.3fr_1.3fr_1fr_2.4fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <div />
          <div>Vendor</div>
          <div>Posting</div>
          <div>Entity</div>
          <div className="text-right">Action</div>
        </div>
        {visible.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400">
            Nothing here — every transaction is documented. 🎉
          </div>
        ) : (
          visible.map((r) => (
            <div
              key={r.id}
              onClick={() => setDrawerId(r.id)}
              className="grid cursor-pointer grid-cols-[16px_2.3fr_1.3fr_1fr_2.4fr] items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0 hover:bg-brand/[0.03]"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  r.auto || r.resolved
                    ? "bg-emerald-500"
                    : r.exception === "dup"
                      ? "bg-red-500"
                      : "bg-amber-500"
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  {r.vendor}
                  {r.doc_waived ? (
                    <Badge tone="neutral">no receipt needed</Badge>
                  ) : r.nodoc ? (
                    <Badge tone="amber">no receipt</Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
                  {r.sub}
                  {r.reason && <span className="text-amber-600"> · {r.reason}</span>}
                </div>
              </div>
              <div className="text-[12.5px]">
                <Badge tone={r.posting === "bill" ? "indigo" : "slate"}>
                  {r.posting === "bill" ? "Bill" : "Charge"}
                </Badge>
                <div className="mt-1 text-xs text-slate-500">{r.account}</div>
              </div>
              <div>
                {r.entity || r.auto ? (
                  <span title={entName(r.entity)}>
                    <Badge tone="green">{r.entity ?? "—"}</Badge>
                  </span>
                ) : (
                  <Badge tone="amber">UNK</Badge>
                )}
                <div className="mt-1.5 font-semibold tabular-nums text-slate-900">
                  {money(r.amount)}
                </div>
              </div>
              <div
                className="flex flex-wrap items-center justify-end gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {actionCell(r)}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-3 text-right text-[11px] text-slate-400">
        Resolve simple exceptions inline. Click a row for the full coding view.
      </p>

      {/* Drawer */}
      <Drawer
        open={!!drawerRow}
        onClose={() => setDrawerId(null)}
        title={drawerRow?.vendor ?? ""}
        subtitle={drawerRow ? `${drawerRow.sub} · ${money(drawerRow.amount)}` : ""}
        footer={drawerRow && drawerFooter(drawerRow)}
      >
        {drawerRow && drawerBody(drawerRow)}
      </Drawer>

      {/* Learn vendor approval */}
      <Modal
        open={!!learnRow}
        onClose={() => setLearnId(null)}
        title="Learn vendor — review before saving"
        width="max-w-xl"
        footer={
          <>
            <button
              onClick={confirmLearn}
              className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Confirm &amp; save
            </button>
            <button
              onClick={() => setLearnId(null)}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        }
      >
        {learnRow && learnBody(learnRow)}
      </Modal>

      {/* CSV / QBO upload */}
      <Modal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="Upload transactions"
        footer={
          <>
            <button
              onClick={() => {
                setShowUpload(false);
                setFilter("docs");
                toast("✓ Imported 18 transactions · 14 auto-coded · 3 missing a receipt");
              }}
              className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Import &amp; parse
            </button>
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        }
      >
        <div className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/[0.03] px-6 py-8 text-center text-sm text-slate-500">
          ⬆ Drop a <b className="text-brand-navy">CSV</b> or{" "}
          <b className="text-brand-navy">.QBO</b> here, or browse
        </div>
        <Field label="Account">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            {ACCTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Entity (which QuickBooks file)">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            {ENTITIES.map((c) => (
              <option key={c}>{`${c} — ${entName(c)}`}</option>
            ))}
          </select>
        </Field>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-[12.5px] text-slate-600">
          📥 Imported transactions land in Payables, get classified, and any missing a receipt are
          flagged under <b>Missing docs</b> — attach an invoice, or mark “no receipt needed.”
        </div>
      </Modal>

      {/* Batch invoice upload */}
      <Modal
        open={showInvoices}
        onClose={() => setShowInvoices(false)}
        title="Upload invoices (batch)"
        footer={
          <>
            <button
              onClick={() => {
                setShowInvoices(false);
                toast("✓ Invoices uploaded — OCR + classify running; exceptions will appear here");
              }}
              className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Upload &amp; process
            </button>
            <button
              onClick={() => setShowInvoices(false)}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        }
      >
        <div className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/[0.03] px-6 py-8 text-center text-sm text-slate-500">
          📄 Drop a <b className="text-brand-navy">batch of invoice PDFs / images</b> here, or browse
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
          No account/entity needed — the agent OCRs each document, classifies entity · GL · vendor,
          and queues it. Only the ones it can’t resolve land in this exception queue.
        </p>
      </Modal>

      <Toast message={message} />
    </div>
  );

  // ---------- inline action cell ----------
  function actionCell(r: Row) {
    if (r.resolved)
      return <span className="text-[12.5px] font-semibold text-emerald-600">✓ {r.resolvedTo}</span>;

    if (filter === "docs") {
      if (r.doc_waived)
        return <span className="text-[12.5px] font-semibold text-emerald-600">✓ no receipt needed</span>;
      return (
        <>
          <Chip onClick={() => resolveDoc(r.id, "attach")} solid>📎 Attach receipt</Chip>
          <Chip onClick={() => resolveDoc(r.id, "waive")}>No receipt needed</Chip>
        </>
      );
    }

    if (r.auto)
      return <span className="text-[12.5px] font-medium text-emerald-600">✓ Auto-coded · {r.gl}</span>;

    if (travelRow === r.id) {
      return (
        <>
          <span className="mr-1 text-xs text-slate-500">Which trip?</span>
          {OPEN_TRIPS.map((t) => (
            <Chip key={t} onClick={() => travelTo(r.id, `→ ${t} trip`)}>{t}</Chip>
          ))}
          <Chip onClick={() => travelTo(r.id, "→ Travel queue (agent suggests)")}>Let Travel suggest</Chip>
          <button className="text-xs text-brand" onClick={() => setTravelRow(null)}>cancel</button>
        </>
      );
    }

    const travelBtn = (
      <Chip onClick={() => setTravelRow(r.id)} className="border-brand/30 text-brand">
        <Plane className="h-3.5 w-3.5" /> Travel
      </Chip>
    );

    if (r.exception === "entity")
      return (
        <>
          {ENTITIES.map((e) => (
            <Chip key={e} title={entName(e)} rec={e === r.recommended} onClick={() => resolveEntity(r.id, e)}>
              {e}
            </Chip>
          ))}
          <Chip onClick={() => setDrawerId(r.id)}>⋯</Chip>
          {travelBtn}
        </>
      );
    if (r.exception === "vendor")
      return (
        <>
          <Chip solid onClick={() => setLearnId(r.id)}>Learn vendor</Chip>
          {travelBtn}
        </>
      );
    if (r.exception === "split")
      return (
        <>
          <Chip solid onClick={() => resolveSimple(r.id, "(split accepted)")}>Accept split</Chip>
          {travelBtn}
        </>
      );
    if (r.exception === "dup")
      return (
        <>
          <Chip onClick={() => resolveSimple(r.id, "(discarded)")}>Discard</Chip>
          <Chip solid onClick={() => resolveSimple(r.id, "(kept)")}>Keep both</Chip>
          {travelBtn}
        </>
      );
    return null;
  }

  // ---------- drawer ----------
  function drawerBody(r: Row) {
    const lines = r.lines ?? [{ desc: r.sub, amount: r.amount, gl: r.gl ?? GLS[0] }];
    return (
      <div className="space-y-5">
        <Section title="Source document">
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
            📄 {r.vendor} — invoice.pdf (preview)
          </div>
          <a className="mt-2 inline-block text-xs font-medium text-brand">Open in Dropbox ↗</a>
        </Section>

        <Section title="Posting">
          <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
            <span className={`rounded-md px-4 py-1.5 text-sm font-semibold ${r.posting === "charge" ? "bg-white text-brand-navy shadow-sm" : "text-slate-500"}`}>
              Charge (card)
            </span>
            <span className={`rounded-md px-4 py-1.5 text-sm font-semibold ${r.posting === "bill" ? "bg-white text-brand-navy shadow-sm" : "text-slate-500"}`}>
              Bill (A/P)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">Pay from</span>
            <select defaultValue={ACCTS.includes(r.account) ? r.account : ACCTS[0]} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-semibold text-brand-navy">
              {ACCTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Coding">
          <table className="w-full text-[13px]">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{l.desc}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.amount)}</td>
                  <td className="py-2 pl-3">
                    <select defaultValue={GLS.includes(l.gl) ? l.gl : GLS[0]} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] font-semibold text-brand">
                      {[l.gl, ...GLS.filter((g) => g !== l.gl)].map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {!r.auto && r.exception === "entity" && (
          <Section title="Which entity pays this?">
            <p className="mb-2.5 text-[12.5px] text-slate-500">
              {r.reason}. Last 3 from this sender → <b>{entName(r.recommended)}</b>.
            </p>
            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((e) => (
                <Chip key={e} rec={e === r.recommended} onClick={() => { resolveEntity(r.id, e); setDrawerId(null); }}>
                  {entName(e)}
                </Chip>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2.5 rounded-lg border border-brand/20 bg-brand/[0.04] px-3.5 py-2.5 text-[13px] text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-brand" /> Always code{" "}
              <b>{r.vendor}</b> → <b>{entName(r.recommended)}</b>
            </label>
          </Section>
        )}

        {!r.auto && r.exception === "dup" && (
          <Section title="Possible duplicate">
            <p className="text-[12.5px] text-slate-500">{r.reason}. Same vendor + amount.</p>
          </Section>
        )}

        {!r.auto && r.exception !== "dup" && (
          <Section title="Not a payable?">
            <p className="mb-2.5 text-[12.5px] text-slate-500">
              If this charge belongs to a trip, reclassify it to Travel — it’ll post under the trip
              vendor instead of here.
            </p>
            <div className="flex flex-wrap gap-2">
              {OPEN_TRIPS.map((t) => (
                <Chip key={t} className="border-brand/30 text-brand" onClick={() => travelTo(r.id, `→ ${t} trip`)}>
                  🧳 {t}
                </Chip>
              ))}
              <Chip className="border-brand/30 text-brand" onClick={() => travelTo(r.id, "→ Travel queue (agent suggests)")}>
                Let Travel suggest
              </Chip>
            </div>
          </Section>
        )}
      </div>
    );
  }

  function drawerFooter(r: Row) {
    if (r.auto)
      return (
        <>
          <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
            Approve &amp; post to QuickBooks
          </button>
          <button onClick={() => setDrawerId(null)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </>
      );
    if (r.exception === "dup")
      return (
        <>
          <button onClick={() => { resolveSimple(r.id, "(discarded)"); setDrawerId(null); }} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Discard
          </button>
          <button onClick={() => { resolveSimple(r.id, "(kept)"); setDrawerId(null); }} className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Keep both
          </button>
        </>
      );
    return (
      <>
        <button
          onClick={() => {
            if (r.exception === "vendor") setLearnId(r.id);
            else if (r.recommended) resolveEntity(r.id, r.recommended);
            else resolveSimple(r.id, "(accepted)");
            setDrawerId(null);
          }}
          className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {r.exception === "vendor"
            ? "Learn vendor"
            : `Confirm${r.recommended ? " " + entName(r.recommended) : ""} & post`}
        </button>
        <button onClick={() => setDrawerId(null)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Skip
        </button>
      </>
    );
  }

  // ---------- learn body ----------
  function learnBody(r: Row) {
    const email = (r.sub.match(/\S+@\S+/) || [""])[0].replace(/[·,].*$/, "").trim();
    const gl = r.lines?.[0]?.gl ?? r.gl ?? GLS[2];
    const same = rows.filter((x) => x.vendor === r.vendor && !x.resolved && !x.auto).length;
    return (
      <div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500">
          Saving will auto-code <b>{same}</b> queued invoice{same > 1 ? "s" : ""} from{" "}
          <b>{r.vendor}</b> (and future ones). Review what the agent writes to{" "}
          <b>QuickBooks</b> and your <b>Outlook contacts</b> before it saves.
        </p>

        <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand-navy">
            🧾 QuickBooks vendor
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-brand">
              new record
            </span>
          </div>
          <Field label="Vendor name">
            <input defaultValue={r.vendor} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
          </Field>
          <div className="flex gap-3">
            <Field label="Default entity (QB file)">
              <select id="lv-entity" defaultValue={r.entity ?? r.recommended ?? "BC"} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
                {ENTITIES.map((c) => (
                  <option key={c} value={c}>{entName(c)}</option>
                ))}
              </select>
            </Field>
            <Field label="Default GL account">
              <select defaultValue={GLS.includes(gl) ? gl : GLS[2]} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
                {[gl, ...GLS.filter((g) => g !== gl)].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Terms">
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
              <option>Net 30</option>
              <option>Due on receipt</option>
              <option>Net 15</option>
              <option>Net 60</option>
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand-navy">
            👤 Contact (Outlook)
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-brand">
              added to jacob@foundry-capital.co
            </span>
          </div>
          <div className="flex gap-3">
            <Field label="Display name">
              <input defaultValue={r.vendor} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="Company">
              <input defaultValue={r.vendor} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="Email">
              <input defaultValue={email} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
            <Field label="Phone">
              <input placeholder="—" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
            </Field>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-400">
            File-as: <b>{r.vendor}</b> · so Outlook indexes it correctly
          </p>
        </div>
      </div>
    );
  }
}

// ---------- small local components ----------
function Chip({
  children,
  onClick,
  solid,
  rec,
  title,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  solid?: boolean;
  rec?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition";
  const style = rec
    ? "border border-brand-navy bg-brand-navy text-white"
    : solid
      ? "bg-brand-navy text-white hover:opacity-90"
      : `border border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-brand/5 ${className}`;
  return (
    <button title={title} onClick={onClick} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-5 last:border-0">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex-1">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
