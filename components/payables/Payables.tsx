"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, Upload, FileText, Plane } from "lucide-react";
import type { PayableRow } from "@/lib/data/payables";
import type { IngestionJob } from "@/lib/data/ingestion";
import {
  ENTITIES,
  entName,
  money,
  glsForEntity,
  BC_ROUTE,
  type PayAccount,
  type GlOption,
} from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import FilterTabs from "@/components/ui/FilterTabs";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

type Row = PayableRow & {
  resolved?: boolean;
  resolvedTo?: string;
  doc_waived?: boolean;
};

const OPEN_TRIPS = ["Builders Capital · Denver", "Foundry Capital · Seattle"];
const missingDoc = (r: Row) => !!r.nodoc && !r.doc_waived;

export default function Payables({
  initial,
  accounts,
  gls,
  bcCategories,
  ingestion,
}: {
  initial: PayableRow[];
  accounts: PayAccount[];
  gls: GlOption[];
  bcCategories: string[];
  ingestion: IngestionJob[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((r) =>
      r.status === "approved" || r.status === "posted"
        ? { ...r, auto: true, resolved: true, resolvedTo: r.status === "posted" ? "→ posted to QuickBooks" : "→ staged for QuickBooks" }
        : r,
    ),
  );
  const [jobs, setJobs] = useState<IngestionJob[]>(ingestion);
  const ingestErrors = useMemo(() => jobs.filter((j) => j.outcome === "error").length, [jobs]);
  async function reprocessJob(id: string) {
    try {
      const res = await fetch("/api/ingest/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, outcome: "pending", detail: "queued for retry" } : j)));
      toast("↻ Re-queued for processing");
    } catch (e) {
      toast(`Reprocess failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  // Pay-from labels (active only — Wells Fargo & other closed accounts excluded
  // upstream in getCodingConfig). GL options are filtered per line by entity.
  const acctLabels = useMemo(() => accounts.map((a) => a.label), [accounts]);
  // Default Pay-from for a row: the account resolved from the invoice card
  // (paymentMethodId) wins; else a label match; else the first account.
  const payDefault = (r: Row) => {
    const byId = accounts.find((a) => a.id === r.paymentMethodId);
    if (byId) return byId.label;
    return acctLabels.includes(r.account) ? r.account : acctLabels[0];
  };
  const glLabels = (entity?: string | null) =>
    glsForEntity(gls, entity).map((g) => g.fullName);
  const firstGl = (entity?: string | null) => glLabels(entity)[0] ?? "";
  const [filter, setFilter] = useState("need");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [travelRow, setTravelRow] = useState<string | null>(null);
  const [learnId, setLearnId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const [invFiles, setInvFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { message, toast } = useToast();

  // Editable coding lines for the open drawer. Each line carries its own entity
  // so one invoice can split across entities (QB invoices). Initialized when the
  // drawer opens; "combine" collapses, the +/× controls split.
  type DrawerLine = { desc: string; amount: number; gl: string; entity: string; bcCategory?: string };
  const [lines, setLines] = useState<DrawerLine[]>([]);
  const [alwaysCode, setAlwaysCode] = useState(false);
  const [payFrom, setPayFrom] = useState<string>("");
  const [posting, setPosting] = useState(false);
  // Entity codes offered as buttons in the coding section: the standard four
  // plus any entity that actually has GL accounts (so splits to WB12/IOTA/etc.
  // are possible). Common ones first.
  const entityCodes = useMemo(() => {
    const fromGls = Array.from(new Set(gls.map((g) => g.entity)));
    const order = ["BC", "FC", "PER", "WJW"];
    const rest = fromGls.filter((c) => !order.includes(c)).sort();
    return [...order, ...rest];
  }, [gls]);
  useEffect(() => {
    const r = rows.find((x) => x.id === drawerId);
    if (!r) return;
    const ent = r.entity ?? r.recommended ?? "PER";
    const bc = ent === "BC" ? bcCategories[0] : undefined;
    const base =
      r.lines && r.lines.length
        ? r.lines.map((l) => ({
            desc: l.desc,
            amount: l.amount,
            gl: ent === "BC" ? BC_ROUTE.gl : l.gl ?? firstGl(ent),
            entity: ent,
            bcCategory: bc,
          }))
        : [{ desc: r.sub || r.vendor, amount: r.amount, gl: ent === "BC" ? BC_ROUTE.gl : r.gl ?? firstGl(ent), entity: ent, bcCategory: bc }];
    setLines(base);
    setAlwaysCode(false);
    setPayFrom(payDefault(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerId]);

  const setLineEntity = (i: number, entity: string) =>
    setLines((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              entity,
              gl: entity === "BC" ? BC_ROUTE.gl : firstGl(entity),
              bcCategory: entity === "BC" ? l.bcCategory ?? bcCategories[0] : undefined,
            }
          : l,
      ),
    );
  const setLineGl = (i: number, gl: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, gl } : l)));
  const setLineBcCategory = (i: number, bcCategory: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, bcCategory } : l)));
  const combineLines = () =>
    setLines((ls) => {
      if (ls.length < 2) return ls;
      const sum = ls.reduce((s, l) => s + l.amount, 0);
      return [{ desc: `Combined (${ls.length} lines)`, amount: sum, gl: ls[0].gl, entity: ls[0].entity }];
    });
  const multiEntity = useMemo(
    () => new Set(lines.map((l) => l.entity)).size > 1,
    [lines],
  );

  async function uploadInvoices() {
    if (!invFiles.length) {
      toast("Pick at least one PDF or image first");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      invFiles.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `upload failed (${res.status})`);
      toast(`✓ Uploaded ${json.jobs.length} document${json.jobs.length > 1 ? "s" : ""} — queued for OCR + classify`);
      setInvFiles([]);
      setShowInvoices(false);
    } catch (e) {
      toast(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

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
  async function confirmLearn() {
    if (!learnRow) return;
    const entity =
      (document.getElementById("lv-entity") as HTMLSelectElement)?.value ||
      learnRow.entity ||
      learnRow.recommended ||
      "BC";
    const gl = (document.getElementById("lv-gl") as HTMLSelectElement)?.value || "";
    const same = rows.filter((r) => r.vendor === learnRow.vendor && !r.resolved && !r.auto);
    setRows((rs) =>
      rs.map((r) =>
        r.vendor === learnRow.vendor && !r.resolved && !r.auto
          ? { ...r, resolved: true, auto: true, entity, resolvedTo: "(vendor learned)" }
          : r,
      ),
    );
    const vendorName = learnRow.vendor;
    setLearnId(null);
    const saved = await saveVendorRule(vendorName, entity, gl);
    toast(
      `✓ Saved ${vendorName} → ${entName(entity)} · ${saved ? "standing rule saved · " : ""}QB vendor created · Outlook contact added · ${same.length} invoice${same.length > 1 ? "s" : ""} coded`,
    );
  }
  // Persist an "always code this vendor this way" rule. Writes to the
  // vendor_rules table (service role) which the agent-system processor reads as
  // an override layer over vendor_master.json.
  async function saveVendorRule(vendor: string, entity: string, gl: string) {
    try {
      const res = await fetch("/api/vendor-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor, entity_code: entity, gl_full_name: gl }),
      });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    } catch {
      return false;
    }
  }

  // Approve a row from the drawer: persist the confirmed coding + stage for the
  // QuickBooks batch post. Real QBO write happens in the backend post_runner.
  async function approveAndPost(r: Row) {
    setPosting(true);
    try {
      const acct = accounts.find((a) => a.label === payFrom);
      const res = await fetch("/api/payables/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id,
          entity: lines[0]?.entity ?? r.entity,
          account: payFrom,
          paymentMethodId: acct?.id ?? r.paymentMethodId ?? null,
          gl: lines[0]?.gl ?? r.gl,
          bcCategory: lines.find((l) => l.entity === "BC")?.bcCategory ?? null,
          lines,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      if (alwaysCode && lines[0]?.entity) await saveVendorRule(r.vendor, lines[0].entity, lines[0].gl);
      patch(r.id, { resolved: true, auto: true, resolvedTo: "→ posted to QuickBooks" });
      setDrawerId(null);
      toast(`✓ ${r.vendor} approved & staged for QuickBooks`);
    } catch (e) {
      toast(`Post failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
  }

  // Confirm the entity (and coding) for a row from the drawer, optionally
  // saving the "always" rule.
  async function confirmEntityFromDrawer(r: Row, code: string) {
    resolveEntity(r.id, code);
    const gl = lines[0]?.gl ?? r.gl ?? "";
    if (alwaysCode) {
      const ok = await saveVendorRule(r.vendor, code, gl);
      toast(
        ok
          ? `✓ ${r.vendor} → ${entName(code)} · saved as the standing rule`
          : `Coded ${r.vendor} → ${entName(code)} (rule not saved — retry)`,
      );
    }
    setDrawerId(null);
  }

  // Bulk: send auto-coded rows back to review when they share a systemic issue
  // (e.g. the same wrong card/entity on every one).
  function moveAllToReview() {
    const n = rows.filter((r) => r.auto && !r.resolved).length;
    if (!n) return;
    setRows((rs) =>
      rs.map((r) =>
        r.auto && !r.resolved
          ? {
              ...r,
              auto: false,
              exception: r.exception ?? "entity",
              reason: r.reason ?? "Returned to review (bulk)",
              recommended: r.recommended ?? r.entity,
            }
          : r,
      ),
    );
    setFilter("need");
    toast(`↩ Moved ${n} auto-coded item${n > 1 ? "s" : ""} back to review`);
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
            <Button onClick={() => toast("Plaid: pulling new transactions… +14 new")}>
              <Zap className="h-4 w-4" /> Get from Plaid
            </Button>
            <Button variant="secondary" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" /> Upload CSV / QBO
            </Button>
            <Button variant="secondary" onClick={() => setShowInvoices(true)}>
              <FileText className="h-4 w-4" /> Upload invoices
            </Button>
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
            { key: "log", label: "Ingestion log", count: ingestErrors || jobs.length },
          ]}
        />
      </div>

      {/* Ingestion log — what entered the pipeline and what happened (nothing
          is silently dropped: errors + skipped duplicates are visible here). */}
      {filter === "log" && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Document · outcome</span>
            <span>{jobs.length} recent · {ingestErrors} error{ingestErrors === 1 ? "" : "s"}</span>
          </div>
          {jobs.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-400">No documents ingested yet.</div>
          ) : (
            jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    j.outcome === "error"
                      ? "bg-red-500"
                      : j.outcome === "duplicate"
                        ? "bg-slate-400"
                        : j.outcome === "filed"
                          ? "bg-emerald-500"
                          : "bg-amber-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-slate-900">
                    {j.filename} <span className="text-[11px] font-normal text-slate-400">· {j.source}</span>
                  </div>
                  {j.detail && (
                    <div className={`truncate text-[12px] ${j.outcome === "error" ? "text-red-600" : "text-slate-500"}`}>
                      {j.detail}
                    </div>
                  )}
                </div>
                <Badge
                  tone={
                    j.outcome === "error"
                      ? "red"
                      : j.outcome === "duplicate"
                        ? "slate"
                        : j.outcome === "filed"
                          ? "green"
                          : "amber"
                  }
                >
                  {j.outcome === "filed" ? "filed ✓" : j.outcome === "duplicate" ? "duplicate" : j.outcome}
                </Badge>
                {j.outcome === "error" && (
                  <Button size="sm" variant="secondary" onClick={() => reprocessJob(j.id)}>
                    ↻ Reprocess
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Bulk action — when the auto-coded batch shares a systemic issue. */}
      {filter === "auto" && counts.auto > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[13px] text-amber-800">
          <span>Spot a systemic problem across these? Send the whole batch back to review.</span>
          <Button size="sm" variant="secondary" onClick={moveAllToReview}>
            ↩ Move all to review
          </Button>
        </div>
      )}

      {/* Queue */}
      {filter !== "log" && (
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
                  {r.docUrl && (
                    <a
                      href={r.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 font-semibold text-brand hover:underline"
                    >
                      📄 doc
                    </a>
                  )}
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
      )}
      {filter !== "log" && (
      <p className="mt-3 text-right text-[11px] text-slate-400">
        Resolve simple exceptions inline. Click a row for the full coding view.
      </p>
      )}

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
            <Button onClick={confirmLearn}>Confirm &amp; save</Button>
            <Button variant="ghost" onClick={() => setLearnId(null)}>Cancel</Button>
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
            <Button
              onClick={() => {
                setShowUpload(false);
                setFilter("docs");
                toast("✓ Imported 18 transactions · 14 auto-coded · 3 missing a receipt");
              }}
            >
              Import &amp; parse
            </Button>
            <Button variant="ghost" onClick={() => setShowUpload(false)}>Cancel</Button>
          </>
        }
      >
        <div className="rounded-xl border-2 border-dashed border-brand/30 bg-brand/[0.03] px-6 py-8 text-center text-sm text-slate-500">
          ⬆ Drop a <b className="text-brand-navy">CSV</b> or{" "}
          <b className="text-brand-navy">.QBO</b> here, or browse
        </div>
        <Field label="Account">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
            {acctLabels.map((a) => (
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
        onClose={() => {
          setShowInvoices(false);
          setInvFiles([]);
        }}
        title="Upload invoices (batch)"
        footer={
          <>
            <Button onClick={uploadInvoices} disabled={uploading}>
              {uploading ? "Uploading…" : invFiles.length ? `Upload ${invFiles.length} file${invFiles.length > 1 ? "s" : ""}` : "Upload & process"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowInvoices(false);
                setInvFiles([]);
              }}
            >
              Cancel
            </Button>
          </>
        }
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length) setInvFiles((prev) => [...prev, ...dropped]);
          }}
          className={`block cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm transition ${
            dragging
              ? "border-brand bg-brand/[0.1] text-brand-navy"
              : "border-brand/30 bg-brand/[0.03] text-slate-500 hover:border-brand hover:bg-brand/[0.06]"
          }`}
        >
          📄 Choose a <b className="text-brand-navy">batch of invoice PDFs / images</b>, or drop them here
          <input
            type="file"
            multiple
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => setInvFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {invFiles.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-[12.5px] text-slate-600">
            {invFiles.map((f, i) => (
              <li key={i} className="flex justify-between gap-2 px-1">
                <span className="truncate">📄 {f.name}</span>
                <span className="shrink-0 text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
          No account/entity needed — each document is stored, OCR’d, classified (entity · GL · vendor),
          and queued. Only the ones the agent can’t resolve land in this exception queue.
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
    return (
      <div className="space-y-5">
        <Section title="Source document">
          {r.docUrl ? (
            <a
              href={r.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 transition hover:border-brand hover:bg-brand/[0.03]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-lg">
                📄
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-900">
                  {r.vendor} — invoice
                </span>
                <span className="block truncate text-[12px] text-slate-500">
                  Filed to Dropbox · {r.sub}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] font-semibold text-brand group-hover:underline">
                Open ↗
              </span>
            </a>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] text-slate-500">
              <span>📎 No document attached yet</span>
              <Button size="sm" variant="ghost" onClick={() => resolveDoc(r.id, "attach")}>
                Attach receipt
              </Button>
            </div>
          )}
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
            <select value={payFrom} onChange={(e) => setPayFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] font-semibold text-brand-navy">
              {acctLabels.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Coding">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] text-slate-500">
              Each line has its own entity &amp; GL — split a QB invoice across entities here.
            </p>
            {lines.length > 1 && (
              <button
                onClick={combineLines}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11.5px] font-semibold text-slate-600 hover:border-brand hover:text-brand"
              >
                ⤺ Combine into 1 line
              </button>
            )}
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-slate-700">{l.desc}</span>
                  <span className="shrink-0 tabular-nums text-[13px] font-semibold text-slate-900">
                    {money(l.amount)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {entityCodes.map((c) => (
                    <button
                      key={c}
                      onClick={() => setLineEntity(i, c)}
                      title={entName(c)}
                      className={`inline-flex h-7 min-w-[2.4rem] items-center justify-center rounded-md px-2 text-[12px] font-bold transition ${
                        l.entity === c
                          ? "bg-brand-navy text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {l.entity === "BC" ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-700">
                        → PER QB · {BC_ROUTE.gl}
                      </span>
                      <select
                        value={l.bcCategory ?? bcCategories[0] ?? ""}
                        onChange={(e) => setLineBcCategory(i, e.target.value)}
                        title="Paylocity expense category (for the BC reimbursement report)"
                        className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[12px] font-semibold text-amber-800"
                      >
                        {bcCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <select
                      value={glLabels(l.entity).includes(l.gl) ? l.gl : ""}
                      onChange={(e) => setLineGl(i, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-semibold text-brand"
                    >
                      {!glLabels(l.entity).includes(l.gl) && (
                        <option value="">Select GL account…</option>
                      )}
                      {glLabels(l.entity).map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          {lines.some((l) => l.entity === "BC") && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-amber-700">
              ⓘ {BC_ROUTE.note} The <b>Paylocity category</b> you pick is captured for
              the BC expense report.
            </p>
          )}
          {multiEntity && (
            <p className="mt-2 text-[11.5px] text-slate-500">
              This invoice splits across multiple entities — the bookkeeper posts one
              leg per entity (intercompany where needed).
            </p>
          )}
        </Section>

        {!r.auto && r.exception === "entity" && (
          <Section title="Which entity pays this?">
            <p className="mb-2.5 text-[12.5px] text-slate-500">
              {r.reason}. Last 3 from this sender → <b>{entName(r.recommended)}</b>.
            </p>
            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((e) => (
                <Chip key={e} rec={e === r.recommended} onClick={() => confirmEntityFromDrawer(r, e)}>
                  {entName(e)}
                </Chip>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2.5 rounded-lg border border-brand/20 bg-brand/[0.04] px-3.5 py-2.5 text-[13px] text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={alwaysCode}
                onChange={(e) => setAlwaysCode(e.target.checked)}
              />{" "}
              Always code <b>{r.vendor}</b> → <b>{entName(lines[0]?.entity ?? r.recommended)}</b>
              {" · "}
              <span className="text-slate-500">{lines[0]?.gl}</span>
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
          <Button onClick={() => approveAndPost(r)} disabled={posting}>
            {posting ? "Posting…" : "Approve & post to QuickBooks"}
          </Button>
          <Button variant="ghost" onClick={() => setDrawerId(null)}>Close</Button>
        </>
      );
    if (r.exception === "dup")
      return (
        <>
          <Button variant="ghost" onClick={() => { resolveSimple(r.id, "(discarded)"); setDrawerId(null); }}>Discard</Button>
          <Button onClick={() => { resolveSimple(r.id, "(kept)"); setDrawerId(null); }}>Keep both</Button>
        </>
      );
    return (
      <>
        {r.exception === "vendor" ? (
          <Button onClick={() => setLearnId(r.id)}>Learn vendor</Button>
        ) : (
          <Button onClick={() => approveAndPost(r)} disabled={posting}>
            {posting ? "Posting…" : `Confirm ${entName(lines[0]?.entity ?? r.recommended ?? r.entity)} & post`}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setDrawerId(null)}>Skip</Button>
      </>
    );
  }

  // ---------- learn body ----------
  function learnBody(r: Row) {
    const email = (r.sub.match(/\S+@\S+/) || [""])[0].replace(/[·,].*$/, "").trim();
    const lvEntity = r.entity ?? r.recommended ?? "BC";
    const lvGls = glLabels(lvEntity);
    const gl = r.lines?.[0]?.gl ?? r.gl ?? lvGls[0] ?? "";
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
              <select id="lv-gl" defaultValue={lvGls.includes(gl) ? gl : lvGls[0]} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">
                {(lvGls.includes(gl) ? lvGls : [gl, ...lvGls]).map((g) => (
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
