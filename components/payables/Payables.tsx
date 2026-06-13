"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, Upload, FileText, Plane } from "lucide-react";
import type { PayableRow, TripOption } from "@/lib/data/payables";
import type { IngestionJob } from "@/lib/data/ingestion";
import {
  entName,
  money,
  glsForEntity,
  glGroupsForEntity,
  glShort,
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

const missingDoc = (r: Row) => !!r.nodoc && !r.doc_waived;

// compact section label used throughout the redesigned coding drawer
const DLBL = "mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-400";

export default function Payables({
  initial,
  accounts,
  gls,
  bcCategories,
  ingestion,
  vendors,
  trips,
}: {
  initial: PayableRow[];
  accounts: PayAccount[];
  gls: GlOption[];
  bcCategories: string[];
  ingestion: IngestionJob[];
  vendors: string[];
  trips: TripOption[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((r) =>
      r.status === "approved" || r.status === "posted"
        ? { ...r, auto: true, resolved: true, resolvedTo: r.status === "posted" ? "→ posted to QuickBooks" : "→ staged for QuickBooks" }
        : r.status === "reclassified"
          ? { ...r, resolved: true, auto: true, resolvedTo: "→ Travel" }
          : r,
    ),
  );
  const [jobs, setJobs] = useState<IngestionJob[]>(ingestion);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [entityPickRow, setEntityPickRow] = useState<string | null>(null);
  // Mass-edit selected invoices (posting type, entity, pay-from, GL).
  type Bulk = { posting?: "charge" | "bill"; entity?: string; paymentMethodId?: string; gl?: string; vendor?: string };
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulk, setBulk] = useState<Bulk>({});
  async function applyBulkEdit() {
    const ids = [...selected];
    if (!ids.length) return;
    const acct = bulk.paymentMethodId ? accounts.find((a) => a.id === bulk.paymentMethodId) : undefined;
    const patch: Record<string, unknown> = {};
    if (bulk.posting) patch.posting = bulk.posting;
    if (bulk.entity) patch.entity = bulk.entity;
    if (bulk.gl) patch.gl = bulk.gl;
    if (bulk.vendor) patch.vendor = bulk.vendor;
    if (bulk.paymentMethodId) {
      patch.paymentMethodId = bulk.paymentMethodId;
      patch.account = acct?.label;
    }
    if (!Object.keys(patch).length) {
      setShowBulkEdit(false);
      return;
    }
    const set = new Set(ids);
    setRows((rs) =>
      rs.map((r) =>
        set.has(r.id)
          ? {
              ...r,
              ...(bulk.entity ? { entity: bulk.entity } : {}),
              ...(bulk.posting ? { posting: bulk.posting } : {}),
              ...(bulk.gl ? { gl: bulk.gl } : {}),
              ...(bulk.vendor ? { vendor: bulk.vendor, vendorStatus: "accepted" } : {}),
              ...(acct ? { account: acct.label, paymentMethodId: acct.id } : {}),
              auto: false,
              resolved: false,
              exception: undefined,
              reason: "Coded — review & post",
            }
          : r,
      ),
    );
    setShowBulkEdit(false);
    try {
      const res = await fetch("/api/payables/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || String(res.status));
      toast(`✓ Updated ${j.updated ?? ids.length} invoice${(j.updated ?? ids.length) === 1 ? "" : "s"}`);
      setBulk({});
      clearSel();
    } catch (e) {
      toast(`Bulk edit failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  // Set a row's entity directly from the queue (entity drives the GL). Updates
  // the row in place (it stays in the queue, now coded), saves the coding, and
  // reverts on failure. Posting happens later via the batch "Post" button.
  async function codeRowInline(r: Row, code: string) {
    const gl = code === "BC" ? BC_ROUTE.gl : glLabels(code).includes(r.gl ?? "") ? r.gl! : firstGl(code);
    const newLines = (r.lines && r.lines.length ? r.lines : [{ desc: r.sub || r.vendor, amount: r.amount, gl }]).map(
      (l) => ({ ...l, entity: code, gl }),
    );
    const prev = { entity: r.entity, gl: r.gl, auto: r.auto, exception: r.exception, reason: r.reason };
    setEntityPickRow(null);
    // Optimistic: show the new entity immediately, mark it coded (clears the
    // exception) but NOT posted — it stays visible for review/posting.
    patch(r.id, { entity: code, recommended: code, gl, lines: newLines, auto: false, exception: undefined, reason: "Coded — review & post" });
    try {
      const res = await fetch("/api/payables/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id, approve: false, entity: code, gl, account: r.account,
          paymentMethodId: r.paymentMethodId ?? null,
          bcCategory: code === "BC" ? "Software subscriptions expense" : null,
          lines: newLines,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast(`✓ ${r.vendor} → ${entName(code)}`);
    } catch {
      patch(r.id, prev); // revert
      toast(`Couldn't save ${r.vendor} — try the drawer`);
    }
  }
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const clearSel = () => setSelected(new Set());
  async function postBatch(ids: string[]) {
    if (!ids.length) return;
    setPosting(true);
    try {
      const res = await fetch("/api/payables/post-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      const set = new Set(ids);
      setRows((rs) => rs.filter((r) => !set.has(r.id))); // staged → leaves the queue for the Bookkeeper
      clearSel();
      const n = json.staged ?? ids.length;
      // Honest wording: this STAGES (status=approved); the Bookkeeper cycle does the actual
      // QBO write. Don't claim "Posted" — that misled operators when the post loop was down.
      toast(`✓ ${n} invoice${n === 1 ? "" : "s"} staged → Bookkeeper will post to QuickBooks`);
    } catch (e) {
      toast(`Batch post failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
  }
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
  // "Reprocess vendors" — re-run vendor ID across the backlog using everything learned
  // (fingerprints + the bill-to guard). After teaching one Safeco invoice, fixes the rest.
  const [reprocessing, setReprocessing] = useState(false);
  async function reprocessVendors() {
    setReprocessing(true);
    try {
      const res = await fetch("/api/payables/reprocess", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `failed (${res.status})`);
      const fixed = json.fixed ?? 0;
      const flagged = json.flagged ?? 0;
      // reflect the re-identified vendors AND their category/GL in the list immediately
      if (Array.isArray(json.changes) && json.changes.length) {
        const byId = new Map<string, { to: string; gl?: string }>(
          json.changes.map((c: { id: string; to: string; gl?: string }) => [c.id, { to: c.to, gl: c.gl }]),
        );
        setRows((rs) =>
          rs.map((r) => {
            const ch = byId.get(r.id);
            if (!ch) return r;
            return { ...r, vendor: ch.to, vendorStatus: "on_file", ...(ch.gl ? { gl: ch.gl, category: undefined } : {}) };
          }),
        );
      }
      toast(
        fixed || flagged
          ? `↻ Reprocessed · ${fixed} vendor${fixed === 1 ? "" : "s"} re-identified${flagged ? ` · ${flagged} flagged for review` : ""}`
          : "↻ Reprocessed · nothing to change",
      );
    } catch (e) {
      toast(`Reprocess failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setReprocessing(false);
    }
  }
  // Persist a lifecycle change for a set of rows (open/approved/discarded).
  async function setStatusBatch(ids: string[], status: "open" | "approved" | "discarded") {
    const res = await fetch("/api/payables/set-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return ((await res.json()) as { count?: number }).count ?? ids.length;
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
  const glGroups = (entity?: string | null) => glGroupsForEntity(gls, entity);
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
  const [memo, setMemo] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [txnDate, setTxnDate] = useState<string>("");
  const [alwaysCode, setAlwaysCode] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [payFrom, setPayFrom] = useState<string>("");
  const [postType, setPostType] = useState<"charge" | "bill">("charge");
  const [posting, setPosting] = useState(false);
  // Pick a sensible BC Paylocity category from the line's expense category, so
  // the dropdown doesn't default to the first (alphabetical) item.
  const matchBcCategory = (category?: string | null): string => {
    const c = (category ?? "").toLowerCase();
    const hit =
      c.includes("software") || c.includes("subscription")
        ? "Software subscriptions expense"
        : c.includes("meal") || c.includes("dining")
          ? "Meals - General"
          : c.includes("travel") || c.includes("airfare") || c.includes("lodging")
            ? "Travel : General"
            : c.includes("office") || c.includes("supplies")
              ? "Office Supplies"
              : c.includes("conference") || c.includes("mtg")
                ? "Conferences or Mtgs - External"
                : "";
    return bcCategories.includes(hit) ? hit : bcCategories[0] ?? "";
  };
  // Unified vendor record for the Learn-vendor modal — one set of fields written
  // to BOTH the QuickBooks vendor and the Outlook contact.
  type VendorForm = {
    vendor: string; display: string; email: string; phone: string; website: string;
    street: string; city: string; state: string; zip: string;
    entity: string; gl: string; terms: string; accountNumber: string;
  };
  const [learnForm, setLearnForm] = useState<VendorForm | null>(null);
  const setLF = (patch: Partial<VendorForm>) => setLearnForm((f) => (f ? { ...f, ...patch } : f));
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
    const bc = ent === "BC" ? matchBcCategory(r.category ?? r.gl) : undefined;
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
    setMemo(r.memo ?? "");
    setInvoiceNumber(r.invoiceNumber ?? "");
    setTxnDate(r.txnDate ?? (r.sub?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ""));
    setAlwaysCode(false);
    setAutoApprove(false);
    setPostType(r.posting === "bill" ? "bill" : "charge");
    setPayFrom(payDefault(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerId]);

  useEffect(() => {
    const r = rows.find((x) => x.id === learnId);
    if (!r) return;
    const ent = r.entity ?? r.recommended ?? "PER";
    const emailGuess = (r.sub.match(/\S+@\S+/) || [""])[0].replace(/[·,].*$/, "").trim();
    const gl0 = r.lines?.[0]?.gl ?? r.gl ?? firstGl(ent);
    const vc = r.vendorContact ?? {};
    setLearnForm({
      vendor: r.vendor,
      display: r.vendor,
      email: vc.email || emailGuess,
      phone: vc.phone || "",
      website: vc.website || (emailGuess.includes("@") ? emailGuess.split("@")[1] : ""),
      street: vc.street || "",
      city: vc.city || "",
      state: vc.state || "",
      zip: vc.zip || "",
      entity: ent,
      gl: gl0,
      terms: r.posting === "bill" ? "Net 30" : "Due on receipt",
      accountNumber: vc.account_number || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnId]);

  const setLineEntity = (i: number, entity: string) =>
    setLines((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              entity,
              gl: entity === "BC" ? BC_ROUTE.gl : firstGl(entity),
              bcCategory: entity === "BC" ? l.bcCategory ?? matchBcCategory(l.gl) : undefined,
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
      return [{ desc: `Combined (${ls.length} lines)`, amount: Math.round(sum * 100) / 100, gl: ls[0].gl, entity: ls[0].entity }];
    });
  const addLine = () =>
    setLines((ls) => {
      const base = ls[0];
      return [...ls, { desc: "New line", amount: 0, gl: base?.gl ?? "", entity: base?.entity ?? "PER", bcCategory: base?.bcCategory }];
    });
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));
  // Apply this vendor's saved multi-line split (entity + account per line). Amounts are
  // prefilled ONLY when this invoice's total matches the prior split's total; otherwise
  // the structure comes in and you enter the amounts. Used on demand — splits are the
  // exception, not the rule, so it's never auto-applied.
  const applySavedSplit = (r: Row) => {
    const tmpl = r.lineTemplate;
    if (!tmpl || tmpl.length < 2) return;
    const priorTot = Math.round(tmpl.reduce((s, t) => s + (t.amount ?? 0), 0) * 100) / 100;
    const same = Math.abs(priorTot - r.amount) < 0.01;
    setLines(
      tmpl.map((t) => ({
        desc: r.vendor,
        amount: same ? (t.amount ?? 0) : 0,
        gl: t.gl ?? "",
        entity: t.entity ?? "PER",
        bcCategory: t.bcCategory,
      })),
    );
    toast(same ? `Applied saved split (${tmpl.length} lines, amounts prefilled)` : `Applied saved split (${tmpl.length} lines) — enter the amounts`);
  };
  const setLineAmount = (i: number, amount: number) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, amount } : l)));
  const multiEntity = useMemo(
    () => new Set(lines.map((l) => l.entity)).size > 1,
    [lines],
  );

  async function uploadInvoices() {
    if (!invFiles.length) {
      toast("Pick at least one PDF or image first");
      return;
    }
    // Vercel serverless functions cap the REQUEST BODY at ~4.5MB, so a batch of invoices
    // posted together 413s. Split into size-bounded chunks (each well under the cap) and
    // upload them sequentially, aggregating the result.
    const CAP = 3.5 * 1024 * 1024;
    const oversize = invFiles.filter((f) => f.size > CAP);
    if (oversize.length) {
      toast(`${oversize[0].name} is too large to upload here (>3.5MB) — split or compress it`);
      return;
    }
    const batches: File[][] = [];
    let cur: File[] = [];
    let curSize = 0;
    for (const f of invFiles) {
      if (cur.length && curSize + f.size > CAP) {
        batches.push(cur);
        cur = [];
        curSize = 0;
      }
      cur.push(f);
      curSize += f.size;
    }
    if (cur.length) batches.push(cur);

    setUploading(true);
    try {
      let uploaded = 0;
      for (const batch of batches) {
        const fd = new FormData();
        batch.forEach((f) => fd.append("files", f));
        const res = await fetch("/api/ingest", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `upload failed (${res.status})`);
        uploaded += json.jobs?.length ?? batch.length;
      }
      toast(`✓ Uploaded ${uploaded} document${uploaded === 1 ? "" : "s"} — queued for OCR + classify`);
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
    // Ready to post = coded rows queued for QuickBooks (agent auto-coded, or
    // operator-coded & awaiting the Post click). Approved rows have already left
    // the queue to Bookkeeper, so we sum what's coded-and-ready here.
    const ready = rows.filter((r) => !r.resolved && (r.auto || (!r.exception && !!r.entity)));
    const readyAmt = ready.reduce((s, r) => s + r.amount, 0);
    return { need, docs, auto, ready: ready.length, readyAmt };
  }, [rows]);

  const rowDate = (r: Row) => r.txnDate || (r.sub?.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
  // Show what it's actually CODED to (the GL leaf, e.g. "Communication"), not the
  // parser's loose invoice_category ("Utilities" isn't a real account) — so the queue
  // matches the drawer's coding line.
  const rowCategory = (r: Row) => glShort(r.gl) || r.category || "";
  // Vendors we've already coded somewhere in the queue — so we don't keep
  // calling every one of their invoices a "first invoice".
  const knownVendors = useMemo(
    () => new Set(rows.filter((r) => r.auto || r.resolved).map((r) => r.vendor.toLowerCase())),
    [rows],
  );
  const displayReason = (r: Row): string | undefined => {
    if (r.auto || r.resolved || !r.reason) return undefined; // coded → no review note
    if (/first invoice/i.test(r.reason) && knownVendors.has(r.vendor.toLowerCase()))
      return "Confirm coding";
    return r.reason;
  };

  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "date", dir: -1 });
  const toggleSort = (col: string) =>
    setSort((s) => (s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: 1 }));

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "auto") return r.auto || r.resolved;
    if (filter === "docs") return missingDoc(r);
    return !r.auto && !r.resolved; // need
  });
  const visible = [...filtered].sort((a, b) => {
    const key = (r: Row): string | number =>
      sort.col === "amount"
        ? r.amount
        : sort.col === "vendor"
          ? r.vendor.toLowerCase()
          : sort.col === "category"
            ? rowCategory(r).toLowerCase()
            : sort.col === "posting"
              ? r.posting
              : sort.col === "entity"
                ? r.entity ?? "~"
                : rowDate(r); // date
    const ka = key(a), kb = key(b);
    return ka < kb ? -sort.dir : ka > kb ? sort.dir : 0;
  });

  const drawerRow = rows.find((r) => r.id === drawerId) || null;
  const learnRow = rows.find((r) => r.id === learnId) || null;

  // ---- resolution actions (all persist + revert on failure) ----
  function resolveEntity(id: string, code: string) {
    const r = rows.find((x) => x.id === id);
    if (r) void codeRowInline(r, code); // codes in place + persists
  }
  // Accept the row's current coding (split / keep-both) and persist it.
  async function acceptRow(id: string, label: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const prev = { auto: r.auto, exception: r.exception, reason: r.reason, resolvedTo: r.resolvedTo };
    patch(id, { auto: false, exception: undefined, reason: "Coded — review & post", resolvedTo: label });
    try {
      const res = await fetch("/api/payables/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approve: false, entity: r.entity, gl: r.gl, account: r.account, paymentMethodId: r.paymentMethodId ?? null, lines: r.lines }),
      });
      if (!res.ok) throw new Error();
    } catch {
      patch(id, prev);
      toast(`Couldn't save ${r.vendor} — try again`);
    }
  }
  // Discard a row (confirmed duplicate): persist + remove from the queue.
  async function discardRow(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setRows((rs) => rs.filter((x) => x.id !== id));
    try {
      await setStatusBatch([id], "discarded");
      toast(`Discarded ${r.vendor}`);
    } catch {
      setRows((rs) => [...rs, r as Row]);
      toast("Couldn't discard — try again");
    }
  }
  function travelTo(id: string, label: string) {
    setTravelRow(null);
    patch(id, { resolved: true, auto: true, resolvedTo: label });
    setDrawerId(null);
    // PERSIST the reclassification (was local-only before — the row vanished with no
    // way back). It stays loaded + recoverable via "Back to review".
    fetch("/api/payables/set-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], status: "reclassified" }),
    }).catch(() => {});
    toast("Sent to Travel — use “Back to review” to undo");
  }
  // Pull a reclassified charge back into the payables review queue.
  function recoverFromTravel(id: string) {
    patch(id, { resolved: false, auto: false, resolvedTo: undefined, exception: "entity", reason: "Back from Travel — review" });
    fetch("/api/payables/set-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], status: "open" }),
    }).catch(() => {});
    toast("Back in the review queue");
  }
  // Re-attribute a charge to a trip (or clear it). The trip supplies the canonical
  // vendor header + entity (+ BC routing); "" = not a trip.
  async function setTrip(id: string, tripId: string) {
    const trip = trips.find((t) => t.tripId === tripId) || null;
    setRows((rs) =>
      rs.map((x) => {
        if (x.id !== id) return x;
        if (!trip) return { ...x, tripId: null };
        const ent = trip.entity ?? x.entity;
        return {
          ...x,
          tripId,
          vendor: trip.header,
          entity: ent,
          recommended: ent ?? undefined,
          exception: undefined,
          gl: ent === "BC" ? "Loan - Builders Capital" : x.gl,
        };
      }),
    );
    try {
      await fetch("/api/payables/set-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tripId }),
      });
      toast(trip ? `Trip → ${trip.header}` : "Cleared trip — back to a normal payable");
    } catch {
      toast("Couldn't change trip — try again");
    }
  }
  // Re-point a charge to an EXISTING vendor the operator picked from the vendor list.
  async function persistVendor(id: string, vendor: string) {
    setRows((rs) =>
      rs.map((x) =>
        x.id === id
          ? { ...x, vendor, vendorStatus: "accepted", exception: x.exception === "vendor" ? undefined : x.exception }
          : x,
      ),
    );
    try {
      const res = await fetch("/api/payables/set-vendor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vendor }),
      });
      // the route applies the vendor's default entity/category — reflect them in the queue
      const j = (await res.json().catch(() => ({}))) as { entity?: string | null; gl?: string | null };
      if (j.entity || j.gl) {
        setRows((rs) =>
          rs.map((x) =>
            x.id === id
              ? { ...x, ...(j.entity ? { entity: j.entity } : {}), ...(j.gl ? { gl: j.gl, category: undefined } : {}) }
              : x,
          ),
        );
      }
      toast(`Vendor → ${vendor}`);
    } catch {
      toast("Couldn't change vendor — try again");
    }
  }
  async function confirmLearn() {
    if (!learnRow || !learnForm) return;
    const f = learnForm;
    const entity = f.entity || learnRow.entity || learnRow.recommended || "BC";
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
    let saved = false;
    try {
      const res = await fetch("/api/vendor-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: vendorName,
          entity_code: entity,
          gl_full_name: f.gl,
          display_name: f.display,
          email: f.email,
          phone: f.phone,
          website: f.website,
          street: f.street,
          city: f.city,
          state: f.state,
          zip: f.zip,
          terms: f.terms,
          account_number: f.accountNumber,
        }),
      });
      saved = res.ok;
    } catch {
      saved = false;
    }
    toast(
      `✓ Saved ${vendorName} → ${entName(entity)} · ${saved ? "rule + QB vendor + Outlook contact saved · " : ""}${same.length} invoice${same.length > 1 ? "s" : ""} coded`,
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
      setRows((rs) => rs.filter((x) => x.id !== r.id)); // approved → leaves the queue, posts
      setDrawerId(null);
      toast(`✓ ${r.vendor} posted to QuickBooks`);
    } catch (e) {
      toast(`Post failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setPosting(false);
    }
  }

  // Drawer "Save": persist THIS invoice's FULL coding — entity, pay-from account,
  // GL/category, lines, posting — and reflect it in the list immediately. The
  // pay-from account used to be local-only (never saved), so popout edits didn't
  // stick; this routes the whole coding through /api/payables/post. Learning the
  // VENDOR for future invoices stays opt-in (the "Always code" / "Auto-approve"
  // toggles). Optimistic with revert.
  async function saveAndRemember(r: Row) {
    const entity = lines[0]?.entity ?? r.entity ?? r.recommended ?? "PER";
    const gl = lines[0]?.gl ?? r.gl ?? "";
    const bcCat = lines.find((l) => l.entity === "BC")?.bcCategory ?? null;
    const acct = accounts.find((a) => a.label === payFrom);
    const acctLabel = acct?.label ?? payFrom ?? r.account;
    const pmId = acct?.id ?? r.paymentMethodId ?? null;
    const remember = alwaysCode || autoApprove; // vendor-level learning is opt-in
    const approveAll = autoApprove;
    const prevRows = rows;
    setRows((rs) =>
      approveAll
        ? rs.filter((x) => (x.id === r.id ? false : !(remember && x.vendor === r.vendor && !x.resolved)))
        : rs.map((x) => {
            if (x.id === r.id)
              return {
                ...x,
                entity, gl, lines,
                account: acctLabel, paymentMethodId: pmId,
                posting: postType,
                auto: false, exception: undefined, reason: "Coded — review & post",
              };
            if (remember && x.vendor === r.vendor && !x.resolved)
              return { ...x, entity, gl, auto: false, exception: undefined, reason: "Coded from vendor rule — review & post" };
            return x;
          }),
    );
    setDrawerId(null);
    try {
      // 1) persist THIS row's full coding (the pay-from account was the piece being dropped)
      const res = await fetch("/api/payables/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id, approve: approveAll, entity, gl,
          account: acctLabel, paymentMethodId: pmId, bcCategory: bcCat,
          lines, posting: postType,
        }),
      });
      if (!res.ok) throw new Error();
      // 2) learn the vendor for sibling/future invoices ONLY when the operator asked
      let count = 0;
      if (remember) {
        const r2 = await fetch("/api/payables/code-vendor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendor: r.vendor, entity, gl, bcCategory: bcCat, autoApprove: approveAll }),
        });
        if (r2.ok) count = ((await r2.json()) as { count: number }).count ?? 0;
      }
      toast(
        remember
          ? approveAll
            ? `✓ ${r.vendor} saved + auto-approved going forward · ${count} invoice${count === 1 ? "" : "s"}`
            : `✓ ${r.vendor} saved + remembered · ${count} invoice${count === 1 ? "" : "s"} coded`
          : `✓ ${r.vendor} saved`,
      );
    } catch {
      setRows(prevRows);
      toast(`Couldn't save ${r.vendor} — try again`);
    }
  }

  // Persist an operator edit to the QBO memo (optimistic; the row keeps it locally
  // so the queue reflects it immediately).
  async function persistMemo(id: string, value: string) {
    const vendor = rows.find((x) => x.id === id)?.vendor ?? "";
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, memo: value } : x)));
    try {
      await fetch("/api/payables/set-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // vendor → the backend learns this format for future invoices from them
        body: JSON.stringify({ id, memo: value, vendor }),
      });
    } catch {
      /* best-effort; the local value still shows and re-saves on next action */
    }
  }

  // Persist an operator edit to the transaction date (→ QB TxnDate).
  async function persistDate(id: string, value: string) {
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, txnDate: value } : x)));
    try {
      await fetch("/api/payables/set-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, date: value }),
      });
    } catch {
      /* best-effort */
    }
  }

  // Persist an operator edit to the invoice number (→ QB invoice-number field).
  async function persistInvoice(id: string, value: string) {
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, invoiceNumber: value } : x)));
    try {
      await fetch("/api/payables/set-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, invoiceNumber: value }),
      });
    } catch {
      /* best-effort; local value still shows */
    }
  }

  // Correct a wrong invoice amount (e.g. parser read $0). Updates the row total and, for a
  // single-line invoice, the line + the open drawer's line state so it still reconciles.
  async function persistAmount(id: string, value: number) {
    setRows((rs) =>
      rs.map((x) => {
        if (x.id !== id) return x;
        const ls = x.lines && x.lines.length === 1 ? [{ ...x.lines[0], amount: value }] : x.lines;
        return { ...x, amount: value, lines: ls };
      }),
    );
    if (lines.length === 1) setLineAmount(0, value);
    try {
      await fetch("/api/payables/set-amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, amount: value }),
      });
      toast(`Amount → ${money(value)}`);
    } catch {
      toast("Couldn't change amount — try again");
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

  // Bulk: send coded/staged rows back to review. Acts on the current selection
  // if any, else every coded-or-staged row in view. Persists + reverts on fail.
  async function moveAllToReview() {
    const targets = (selected.size
      ? rows.filter((r) => selected.has(r.id))
      : rows.filter((r) => r.auto || r.resolved)
    ).map((r) => r.id);
    if (!targets.length) {
      toast("Nothing to move — select coded rows first");
      return;
    }
    const snapshot = new Map(rows.filter((r) => targets.includes(r.id)).map((r) => [r.id, r]));
    const set = new Set(targets);
    setRows((rs) =>
      rs.map((r) =>
        set.has(r.id)
          ? { ...r, auto: false, resolved: false, resolvedTo: undefined, exception: r.exception ?? "entity", reason: "Returned to review", recommended: r.recommended ?? r.entity }
          : r,
      ),
    );
    clearSel();
    setFilter("need");
    try {
      await setStatusBatch(targets, "open");
      toast(`↩ Moved ${targets.length} back to review`);
    } catch {
      setRows((rs) => rs.map((r) => snapshot.get(r.id) ?? r)); // revert
      toast("Couldn't move to review — try again");
    }
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
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader
        title="Payables"
        subtitle="Exception queue — you only touch what the agent can't resolve confidently."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled title="Plaid bank-feed isn't connected yet — use Upload CSV/QBO or Upload invoices">
              <Zap className="h-4 w-4" /> Get from Plaid (soon)
            </Button>
            <Button variant="secondary" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" /> Upload CSV / QBO
            </Button>
            <Button variant="secondary" onClick={() => setShowInvoices(true)}>
              <FileText className="h-4 w-4" /> Upload invoices
            </Button>
            <Button variant="ghost" onClick={reprocessVendors} disabled={reprocessing} title="Re-run vendor ID on the queue using everything learned">
              ↻ {reprocessing ? "Reprocessing…" : "Reprocess vendors"}
            </Button>
          </div>
        }
      />

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        🧳 Charges that land inside a trip window are routed to <b>Travel</b>.
        Meals and rides <b>outside</b> a trip window stay here as payables.
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Stat label="Need you" value={counts.need} tone="amber" />
        <Stat label="Missing docs" value={counts.docs} tone="amber" />
        <Stat label="Auto-coded ✓" value={counts.auto} tone="green" />
        <Stat label="Ready to post" value={money(counts.readyAmt)} tone="navy" />
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
              <div key={j.id} className={`flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 ${j.superseded ? "opacity-55" : ""}`}>
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
                  {(j.superseded || j.detail) && (
                    <div className={`truncate text-[12px] ${j.outcome === "error" ? "text-red-600" : "text-slate-500"}`}>
                      {j.superseded ? "duplicate — invoice already in the system ✓" : j.detail}
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
                  {j.outcome === "filed"
                    ? "filed ✓"
                    : j.outcome === "duplicate"
                      ? j.superseded ? "in system ✓" : "duplicate"
                      : j.outcome}
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

      {/* Batch select + actions — the QuickBooks checkpoint. */}
      {filter !== "log" && visible.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] shadow-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={visible.length > 0 && visible.every((r) => selected.has(r.id))}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
              }
            />
            {selected.size > 0 ? `${selected.size} selected` : `Select all ${visible.length}`}
          </label>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={clearSel}>
                  Clear
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setBulk({}); setShowBulkEdit(true); }}>
                  ✎ Edit {selected.size}
                </Button>
                <Button size="sm" variant="secondary" onClick={moveAllToReview} disabled={posting}>
                  ↩ Move to review
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() => postBatch([...selected])}
              disabled={posting || selected.size === 0}
            >
              {posting ? "Posting…" : `Post ${selected.size || ""} to QuickBooks`}
            </Button>
          </div>
        </div>
      )}

      {/* Queue */}
      {filter !== "log" && (
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[20px_14px_minmax(0,1.7fr)_84px_minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_92px_minmax(0,1.4fr)] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <div />
          <div />
          <SortHead label="Vendor" col="vendor" sort={sort} onClick={toggleSort} />
          <SortHead label="Date" col="date" sort={sort} onClick={toggleSort} />
          <SortHead label="Category" col="category" sort={sort} onClick={toggleSort} />
          <SortHead label="Posting" col="posting" sort={sort} onClick={toggleSort} />
          <SortHead label="Entity" col="entity" sort={sort} onClick={toggleSort} />
          <SortHead label="Amount" col="amount" sort={sort} onClick={toggleSort} align="right" />
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
              className="grid cursor-pointer grid-cols-[20px_14px_minmax(0,1.7fr)_84px_minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_92px_minmax(0,1.4fr)] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0 hover:bg-brand/[0.03]"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={selected.has(r.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSel(r.id)}
              />
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  r.auto || r.resolved
                    ? "bg-emerald-500"
                    : r.exception === "dup"
                      ? "bg-red-500"
                      : "bg-amber-500"
                }`}
              />
              {/* Vendor */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate font-semibold text-slate-900">
                  {r.vendorStatus === "new" ? (
                    <span title="New vendor — not in your vendor master" className="shrink-0 font-bold text-red-500">✗</span>
                  ) : (
                    <span title="On file in your vendor master" className="shrink-0 font-bold text-emerald-600">✓</span>
                  )}
                  <span className="truncate">{r.vendor}</span>
                  {r.doc_waived ? (
                    <Badge tone="neutral">no receipt</Badge>
                  ) : r.nodoc ? (
                    <Badge tone="amber">no receipt</Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">
                  <span className={r.invoiceNumber ? "" : "text-amber-600"}>
                    Inv {r.invoiceNumber || "—"}
                  </span>
                </div>
                {/* memo — editable inline, per transaction (persists to QB on blur) */}
                <input
                  key={`memo-${r.id}-${r.memo ?? ""}`}
                  defaultValue={r.memo ?? ""}
                  title={r.memo || "Add a memo for this transaction"}
                  placeholder="+ memo"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (r.memo ?? "")) persistMemo(r.id, v);
                  }}
                  className="mt-0.5 w-full truncate rounded border border-transparent bg-transparent px-1 text-[11.5px] italic text-slate-400 placeholder:not-italic placeholder:text-slate-300 hover:border-slate-200 focus:border-brand focus:bg-white focus:not-italic focus:text-slate-700 focus:outline-none"
                />
              </div>
              {/* Date */}
              <div className="text-[12.5px] tabular-nums text-slate-600">{rowDate(r) || "—"}</div>
              {/* Category */}
              <div className="truncate text-[12.5px] text-slate-700" title={rowCategory(r)}>
                {rowCategory(r) || "—"}
              </div>
              {/* Posting */}
              <div className="min-w-0 text-[12px]">
                <Badge tone={r.posting === "bill" ? "indigo" : "slate"}>
                  {r.posting === "bill" ? "Bill" : "Charge"}
                </Badge>
                <div className="mt-1 truncate text-[11px] text-slate-500" title={r.account}>{r.account}</div>
              </div>
              {/* Entity (inline picker; multi-line opens the drawer) */}
              <div onClick={(e) => e.stopPropagation()}>
                {entityPickRow === r.id ? (
                  <div className="flex flex-wrap gap-1">
                    {entityCodes.map((c) => (
                      <button
                        key={c}
                        title={entName(c)}
                        onClick={() => codeRowInline(r, c)}
                        className={`inline-flex h-6 min-w-[2.1rem] items-center justify-center rounded px-1.5 text-[11px] font-bold transition ${
                          c === r.entity ? "bg-brand-navy text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                    <button className="text-[11px] text-slate-400 hover:text-slate-600" onClick={() => setEntityPickRow(null)}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => ((r.lines?.length ?? 0) > 1 ? setDrawerId(r.id) : setEntityPickRow(r.id))}
                    title={(r.lines?.length ?? 0) > 1 ? "Multiple line items — open to split by entity/GL" : "Click to set entity"}
                    className="rounded-md transition hover:ring-2 hover:ring-brand/30"
                  >
                    <Badge tone={r.entity ? "green" : "amber"}>
                      {r.entity ?? "UNK"} {(r.lines?.length ?? 0) > 1 ? "⋯" : "⌄"}
                    </Badge>
                  </button>
                )}
              </div>
              {/* Amount */}
              <div className="text-right font-semibold tabular-nums text-slate-900">{money(r.amount)}</div>
              {/* Action */}
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
        title={
          drawerRow ? (
            <span className="flex items-center gap-2">
              <span className={drawerRow.vendorStatus === "new" ? "text-red-500" : "text-emerald-600"}>
                {drawerRow.vendorStatus === "new" ? "✗" : "✓"}
              </span>
              {drawerRow.vendor}
            </span>
          ) : ""
        }
        subtitle={drawerRow?.sub ?? ""}
        headerRight={
          drawerRow ? (
            <>
              <div className="text-xl font-bold tabular-nums text-slate-900">{money(drawerRow.amount)}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount</div>
            </>
          ) : null
        }
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
            {entityCodes.map((c) => (
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

      {/* Mass edit selected invoices */}
      <Modal
        open={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        title={`Edit ${selected.size} invoice${selected.size === 1 ? "" : "s"}`}
        width="max-w-lg"
        footer={
          <>
            <Button onClick={applyBulkEdit}>Apply to {selected.size}</Button>
            <Button variant="ghost" onClick={() => setShowBulkEdit(false)}>Cancel</Button>
          </>
        }
      >
        <p className="mb-3 text-[12.5px] text-slate-500">
          Only the fields you set change; the rest stay as they are. Applies to all
          selected rows.
        </p>
        {/* order: payment from · vendor · entity · account (GL) · posting */}
        <Field label="Pay from">
          <select
            value={bulk.paymentMethodId ?? ""}
            onChange={(e) => setBulk((b) => ({ ...b, paymentMethodId: e.target.value || undefined }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="">No change</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Vendor">
          <input
            list="fc-vendor-bulk"
            value={bulk.vendor ?? ""}
            onChange={(e) => setBulk((b) => ({ ...b, vendor: e.target.value || undefined }))}
            placeholder="Leave blank to keep each row's vendor…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 focus:border-brand focus:outline-none"
          />
          <datalist id="fc-vendor-bulk">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Entity">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setBulk((b) => ({ ...b, entity: undefined, gl: undefined }))}
              className={`inline-flex h-7 items-center justify-center rounded-md px-2 text-[12px] font-bold ${!bulk.entity ? "bg-brand-navy text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand"}`}
            >
              No change
            </button>
            {entityCodes.map((c) => (
              <button
                key={c}
                title={entName(c)}
                onClick={() => setBulk((b) => ({ ...b, entity: c, gl: c === "BC" ? BC_ROUTE.gl : undefined }))}
                className={`inline-flex h-7 min-w-[2.4rem] items-center justify-center rounded-md px-2 text-[12px] font-bold ${bulk.entity === c ? "bg-brand-navy text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        {bulk.entity !== "BC" && (
          <Field label="GL account">
            <select
              value={bulk.gl ?? ""}
              onChange={(e) => setBulk((b) => ({ ...b, gl: e.target.value || undefined }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">No change</option>
              {glGroups(bulk.entity).map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        {bulk.entity === "BC" && (
          <p className="text-[12px] text-amber-700">BC → posts to PER QB as {BC_ROUTE.gl}.</p>
        )}
        <Field label="Posting">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {[
              { k: undefined, label: "No change" },
              { k: "charge" as const, label: "Charge (card)" },
              { k: "bill" as const, label: "Bill (A/P)" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setBulk((b) => ({ ...b, posting: o.k }))}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition ${bulk.posting === o.k ? "bg-white text-brand-navy shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
      </Modal>

      <Toast message={message} />
    </div>
  );

  // ---------- inline action cell ----------
  function actionCell(r: Row) {
    if (r.resolved)
      return (
        <span className="inline-flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-emerald-600">✓ {r.resolvedTo}</span>
          {/travel/i.test(r.resolvedTo ?? "") && (
            <button
              onClick={() => recoverFromTravel(r.id)}
              className="text-[11.5px] font-semibold text-brand hover:underline"
            >
              Back to review
            </button>
          )}
        </span>
      );

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
      return <span className="text-[12.5px] font-medium text-emerald-600">✓ Auto-coded · {glShort(r.gl)}</span>;

    if (travelRow === r.id) {
      return (
        <>
          <span className="mr-1 text-xs text-slate-500">Send to Travel?</span>
          <Chip solid onClick={() => travelTo(r.id, "→ Travel")}>Confirm</Chip>
          <button className="text-xs text-brand" onClick={() => setTravelRow(null)}>cancel</button>
        </>
      );
    }

    const travelBtn = (
      <Chip onClick={() => setTravelRow(r.id)} title="Reclassify to Travel" className="border-brand/30 text-brand">
        <Plane className="h-3.5 w-3.5" />
      </Chip>
    );

    // Coded (entity + GL set) but not yet an auto-coded exception and not posted
    // — e.g. coded from a learned vendor. Review the charge, then post.
    if (!r.exception && r.entity)
      return (
        <>
          <Chip solid onClick={() => postBatch([r.id])}>✓ Post</Chip>
          {travelBtn}
        </>
      );

    if (r.exception === "entity")
      return (
        <>
          {entityCodes.map((e) => (
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
          <Chip solid onClick={() => acceptRow(r.id, "(split accepted)")}>Accept split</Chip>
          {travelBtn}
        </>
      );
    if (r.exception === "dup")
      return (
        <>
          <Chip onClick={() => discardRow(r.id)}>Discard</Chip>
          <Chip solid onClick={() => acceptRow(r.id, "(kept)")}>Keep both</Chip>
          {travelBtn}
        </>
      );
    return null;
  }

  // ---------- drawer ----------
  function drawerBody(r: Row) {
    return (
      <div className="space-y-3.5">
        {/* source — one line */}
        {r.docUrl ? (
          <a
            href={r.docUrl}
            // Open the invoice in a SEPARATE browser window (not a tab) so you can
            // Cmd-` between the portal and the invoice. A stable window name reuses one
            // preview window instead of piling up.
            onClick={(e) => {
              e.preventDefault();
              window.open(r.docUrl!, "fcInvoicePreview", "noopener,noreferrer,width=1200,height=1000,left=120,top=80");
            }}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-brand hover:bg-brand/[0.03]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-[14px]">📄</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-slate-900">{r.vendor} — invoice</span>
              <span className="block truncate text-[11.5px] text-slate-500">Filed to Dropbox · {r.sub}</span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-brand group-hover:underline">Open ↗</span>
          </a>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-500">
            <span>📎 No document attached</span>
            <Button size="sm" variant="ghost" onClick={() => resolveDoc(r.id, "attach")}>Attach receipt</Button>
          </div>
        )}

        {/* vendor — re-point to an existing vendor from the list (typeahead) */}
        <div>
          <div className={DLBL}>Vendor</div>
          <input
            key={r.id}
            list="fc-vendor-list"
            defaultValue={r.vendor}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== r.vendor) persistVendor(r.id, v);
            }}
            placeholder="Search vendors…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 focus:border-brand focus:outline-none"
          />
          <datalist id="fc-vendor-list">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>

        {/* trip — re-attribute to the correct trip, or clear to a normal payable */}
        {trips.length > 0 && (
          <div>
            <div className={DLBL}>Trip</div>
            <select
              value={r.tripId ?? ""}
              onChange={(e) => setTrip(r.id, e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-brand focus:outline-none"
            >
              <option value="">— Not a trip (normal payable) —</option>
              {trips.map((t) => (
                <option key={t.tripId} value={t.tripId}>
                  {t.header}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* posting + pay-from, two-up */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={DLBL}>Posting</div>
            <div className="flex w-full gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setPostType("charge")}
                className={`flex-1 rounded-md py-1.5 text-[12.5px] font-semibold transition ${postType === "charge" ? "bg-white text-brand-navy shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Charge
              </button>
              <button
                onClick={() => setPostType("bill")}
                className={`flex-1 rounded-md py-1.5 text-[12.5px] font-semibold transition ${postType === "bill" ? "bg-white text-brand-navy shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Bill
              </button>
            </div>
          </div>
          <div>
            <div className={DLBL}>Pay from</div>
            <select value={payFrom} onChange={(e) => setPayFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] font-semibold text-brand-navy">
              {acctLabels.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-0.5">
          <div className="mb-1 flex items-center justify-between">
            <div className={DLBL}>
              Coding <span className="font-medium normal-case tracking-normal text-slate-400">· split across entities/GLs by line</span>
            </div>
            {lines.length > 1 && (
              <button onClick={combineLines} className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-brand hover:text-brand">⤺ Combine</button>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-2.5">
            {lines.map((l, i) => (
              <div
                key={i}
                className={lines.length > 1 ? "rounded-lg border border-slate-200 bg-white p-2" : ""}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{l.desc}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[12px] text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={l.amount}
                      onChange={(e) => setLineAmount(i, parseFloat(e.target.value) || 0)}
                      className="w-20 rounded border border-slate-200 px-1.5 py-1 text-right text-[13px] font-semibold tabular-nums focus:border-brand focus:outline-none"
                    />
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(i)} title="Remove line" className="px-1 text-slate-300 hover:text-red-500">
                        ×
                      </button>
                    )}
                  </div>
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
                        value={l.bcCategory ?? matchBcCategory(r.category ?? r.gl)}
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
                      {glGroups(l.entity).map((grp) => (
                        <optgroup key={grp.label} label={grp.label}>
                          {grp.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
            {r.lineTemplate && r.lineTemplate.length >= 2 && (
              <button
                onClick={() => applySavedSplit(r)}
                className="w-full rounded-lg border border-brand/30 bg-brand/[0.04] px-3 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand/10"
              >
                ⎘ Apply saved split for {r.vendor} ({r.lineTemplate.length} lines)
              </button>
            )}
            <div className="flex items-center justify-between pt-0.5">
              <button onClick={addLine} className="text-[12px] font-semibold text-brand hover:underline">
                + Add coding line
              </button>
              {(() => {
                const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
                const off = Math.abs(sum - r.amount) > 0.01;
                return (
                  <span className={`text-[11.5px] tabular-nums ${off ? "font-semibold text-red-600" : "text-slate-400"}`}>
                    Lines {money(sum)} {off ? `≠ ${money(r.amount)}` : "= invoice ✓"}
                  </span>
                );
              })()}
            </div>
          </div>
          {multiEntity && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Splits across entities — the bookkeeper posts one leg per entity (intercompany where needed).
            </p>
          )}
        </div>

        {/* QuickBooks — invoice # + date two-up, memo full-width below */}
        <div>
          <div className={DLBL}>QuickBooks</div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                onBlur={() => { if (invoiceNumber !== (r.invoiceNumber ?? "")) persistInvoice(r.id, invoiceNumber); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700"
                placeholder="Invoice #"
              />
              <div className="mt-0.5 text-[10px] text-slate-400">Invoice # → QB Ref no.</div>
            </div>
            <div>
              <input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
                onBlur={() => { if (txnDate !== (r.txnDate ?? rowDate(r))) persistDate(r.id, txnDate); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700"
              />
              <div className="mt-0.5 text-[10px] text-slate-400">Transaction date → QB TxnDate</div>
            </div>
            <div>
              <input
                key={r.id + "-amt"}
                type="number"
                step="0.01"
                defaultValue={r.amount}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v >= 0 && Math.abs(v - r.amount) > 0.001) persistAmount(r.id, v);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-[12.5px] font-semibold tabular-nums text-slate-700"
                placeholder="Amount"
              />
              <div className="mt-0.5 text-[10px] text-slate-400">Invoice total → QB amount</div>
            </div>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => { if (memo !== (r.memo ?? "")) persistMemo(r.id, memo); }}
            rows={2}
            className="mt-2.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700"
            placeholder="Memo — auto-written, edit if needed"
          />
        </div>

        {/* trust vendor */}
        <label className="flex items-start gap-2.5 rounded-lg border border-brand/20 bg-brand/[0.04] px-3 py-2.5 text-[12.5px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
          />
          <span><b>Auto-approve future {r.vendor} invoices</b> — code &amp; post, no review.</span>
        </label>

        {!r.auto && r.exception === "entity" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className={DLBL}>Which entity pays this?</div>
            <p className="mb-2 text-[12px] text-slate-600">{r.reason}. Last 3 → <b>{entName(r.recommended)}</b>.</p>
            <div className="flex flex-wrap gap-2">
              {entityCodes.map((e) => (
                <Chip key={e} rec={e === r.recommended} onClick={() => confirmEntityFromDrawer(r, e)}>{e}</Chip>
              ))}
            </div>
            <label className="mt-2.5 flex items-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-[12px] text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={alwaysCode} onChange={(e) => setAlwaysCode(e.target.checked)} />
              Always code <b>{r.vendor}</b> → <b>{entName(lines[0]?.entity ?? r.recommended)}</b> · <span className="text-slate-500">{glShort(lines[0]?.gl)}</span>
            </label>
          </div>
        )}

        {!r.auto && r.exception === "dup" && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            <div className={DLBL}>Possible duplicate</div>
            <p className="text-[12px] text-slate-600">{r.reason}. Same vendor + amount.</p>
          </div>
        )}

        {!r.auto && r.exception !== "dup" && (
          <button
            onClick={() => travelTo(r.id, "→ Travel")}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:underline"
          >
            <Plane className="h-3.5 w-3.5" /> Not a payable? Reclassify to Travel
          </button>
        )}
      </div>
    );
  }

  function drawerFooter(r: Row) {
    // equal-width footer buttons (flex-1)
    if (r.auto)
      return (
        <>
          <Button className="flex-1" variant="ghost" onClick={() => setDrawerId(null)}>Close</Button>
          <Button className="flex-1 !bg-brand hover:!opacity-90" onClick={() => approveAndPost(r)} disabled={posting}>
            {posting ? "Posting…" : "Post"}
          </Button>
        </>
      );
    if (r.exception === "dup")
      return (
        <>
          <Button className="flex-1" variant="ghost" onClick={() => { discardRow(r.id); setDrawerId(null); }}>Discard</Button>
          <Button className="flex-1" onClick={() => { acceptRow(r.id, "(kept)"); setDrawerId(null); }}>Keep both</Button>
        </>
      );
    return (
      <>
        <Button className="flex-1" onClick={() => saveAndRemember(r)} disabled={posting}>Save</Button>
        <Button className="flex-1" variant="secondary" onClick={() => setLearnId(r.id)}>Add vendor…</Button>
        <Button className="flex-1 !bg-brand !text-white hover:!opacity-90" onClick={() => approveAndPost(r)} disabled={posting}>
          {posting ? "Posting…" : "Post"}
        </Button>
      </>
    );
  }

  // ---------- learn body ----------
  function learnBody(r: Row) {
    const same = rows.filter((x) => x.vendor === r.vendor && !x.resolved && !x.auto).length;
    const f = learnForm;
    if (!f) return null;
    const fGls = glLabels(f.entity);
    const inp = "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none";
    return (
      <div className="space-y-4">
        {r.vendorStatus === "accepted" ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12.5px] font-semibold text-emerald-800">
            ✓ Previously accepted — already on file in your vendor master. Edits here update it.
          </div>
        ) : r.vendorStatus === "on_file" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12.5px] font-semibold text-amber-800">
            ℹ On file in your vendor master (auto-added) — confirm to accept it.
          </div>
        ) : null}
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          One record, written to <b>both</b> your <b>QuickBooks vendor list</b> and your{" "}
          <b>Outlook contacts</b>. Saving also confirms the vendor, so its{" "}
          <b>{same}</b> queued invoice{same === 1 ? "" : "s"} (and future ones) auto-code.
        </p>

        {/* Identity — shared by QB vendor + Outlook contact */}
        <div className="rounded-xl border border-slate-200 p-3.5">
          <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand-navy">
            Vendor record
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-brand">
              → QuickBooks vendor · → Outlook contact
            </span>
          </div>
          <div className="flex gap-3">
            <Field label="Company / vendor name">
              <input value={f.vendor} onChange={(e) => setLF({ vendor: e.target.value })} className={inp} />
            </Field>
            <Field label="Display name (file-as)">
              <input value={f.display} onChange={(e) => setLF({ display: e.target.value })} className={inp} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="Email">
              <input value={f.email} onChange={(e) => setLF({ email: e.target.value })} className={inp} />
            </Field>
            <Field label="Phone">
              <input value={f.phone} onChange={(e) => setLF({ phone: e.target.value })} placeholder="(208) 555-0142" className={inp} />
            </Field>
            <Field label="Website">
              <input value={f.website} onChange={(e) => setLF({ website: e.target.value })} placeholder="example.com" className={inp} />
            </Field>
          </div>
          <Field label="Street address">
            <input value={f.street} onChange={(e) => setLF({ street: e.target.value })} placeholder="11921 Freedom Dr, Suite 550" className={inp} />
          </Field>
          <div className="flex gap-3">
            <Field label="City">
              <input value={f.city} onChange={(e) => setLF({ city: e.target.value })} className={inp} />
            </Field>
            <Field label="State">
              <input value={f.state} onChange={(e) => setLF({ state: e.target.value })} placeholder="VA" className={inp} />
            </Field>
            <Field label="ZIP">
              <input value={f.zip} onChange={(e) => setLF({ zip: e.target.value })} className={inp} />
            </Field>
          </div>
          <p className="text-[11.5px] text-slate-400">
            File-as: <b>{f.display || f.vendor}</b> — so Outlook indexes it correctly.
          </p>
        </div>

        {/* Coding defaults — QuickBooks */}
        <div className="rounded-xl border border-slate-200 p-3.5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-navy">
            Default coding (QuickBooks)
          </div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Entity</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {entityCodes.map((c) => (
              <button
                key={c}
                title={entName(c)}
                onClick={() => setLF({ entity: c, gl: c === "BC" ? BC_ROUTE.gl : glLabels(c)[0] ?? "" })}
                className={`inline-flex h-7 min-w-[2.4rem] items-center justify-center rounded-md px-2 text-[12px] font-bold transition ${
                  f.entity === c ? "bg-brand-navy text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <Field label="Default GL account">
              {f.entity === "BC" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700">
                  PER QB · {BC_ROUTE.gl}
                </div>
              ) : (
                <select value={fGls.includes(f.gl) ? f.gl : ""} onChange={(e) => setLF({ gl: e.target.value })} className={inp}>
                  {!fGls.includes(f.gl) && <option value="">Select GL account…</option>}
                  {glGroups(f.entity).map((grp) => (
                    <optgroup key={grp.label} label={grp.label}>
                      {grp.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Payment terms">
              <select value={f.terms} onChange={(e) => setLF({ terms: e.target.value })} className={inp}>
                <option>Due on receipt</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
              </select>
            </Field>
            <Field label="Our account # (optional)">
              <input value={f.accountNumber} onChange={(e) => setLF({ accountNumber: e.target.value })} className={inp} />
            </Field>
          </div>
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
    "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold transition";
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

function SortHead({
  label,
  col,
  sort,
  onClick,
  align = "left",
}: {
  label: string;
  col: string;
  sort: { col: string; dir: 1 | -1 };
  onClick: (col: string) => void;
  align?: "left" | "right";
}) {
  const active = sort.col === col;
  return (
    <button
      onClick={() => onClick(col)}
      className={`flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-600 ${
        align === "right" ? "justify-end text-right" : ""
      } ${active ? "text-brand" : ""}`}
    >
      {label}
      <span className="text-[9px]">{active ? (sort.dir > 0 ? "▲" : "▼") : "↕"}</span>
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
