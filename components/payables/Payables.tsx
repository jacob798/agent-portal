"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Upload, FileText, Plane, Plus, Pencil, Lock, UploadCloud } from "lucide-react";
import type { PayableRow, TripOption, DocTypeOption, RowQuestion } from "@/lib/data/payables";
import type { IngestionJob } from "@/lib/data/ingestion";
import {
  entName,
  money,
  glsForEntity,
  payFromForEntity,
  vendorsForEntity,
  type VendorOption,
  ACTIVE_ENTITIES,
  glGroupsForEntity,
  glShort,
  BC_ROUTE,
  type PayAccount,
  type GlOption,
  VENDOR_CATEGORIES,
  vendorCatLabel,
  postingOptionsForEntity,
} from "@/lib/data/entities";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Stat from "@/components/ui/Stat";
import FilterTabs from "@/components/ui/FilterTabs";
import Drawer from "@/components/ui/Drawer";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { InlineQuestion } from "@/components/shared/InlineQuestion";

type Row = PayableRow & {
  resolved?: boolean;
  resolvedTo?: string;
  doc_waived?: boolean;
};

const missingDoc = (r: Row) => !!r.nodoc && !r.doc_waived;

// Pay-from sentinel: an unpaid Bill (pay later) has NO payment method. Picking this in the
// pay-from dropdown clears the method and flips the row to a Bill; any real card/bank → Expense.
const BILL_OPTION = "Bill — pay later (no payment method)";

// Plain-text date editing (no native date-picker chrome — Jacob: "the data graphic is awkward").
// ISO (YYYY-MM-DD) → "M/D/YYYY" for display; parse "M/D[/YY[YY]]" or ISO back to ISO (year defaults
// to the row's current year). Returns "" when unparseable so the caller can revert.
const fmtMDY = (iso?: string | null): string => {
  // MM/DD/YY (Jacob, 2026-06-21) — zero-padded month/day, 2-digit year.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "";
};
const parseMDY = (s: string, fallbackIso?: string | null): string => {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
  if (!m) return "";
  let yr = m[3] || (fallbackIso ?? "").slice(0, 4) || String(new Date().getFullYear());
  if (yr.length === 2) yr = "20" + yr;
  return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
};

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
  docTypes = [],
}: {
  initial: PayableRow[];
  accounts: PayAccount[];
  gls: GlOption[];
  bcCategories: string[];
  ingestion: IngestionJob[];
  vendors: VendorOption[];
  trips: TripOption[];
  docTypes?: DocTypeOption[];
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
  const router = useRouter();
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
  // Inline coding save from the ledger row (account / pay-from / BC category). Optimistic patch
  // then persist via the same /api/payables/post (approve:false) the entity chip uses; reverts on
  // failure. Keeps the row in the queue, coded, for the batch Post.
  async function saveRowFields(r: Row, fields: Partial<Row> & { bcCategory?: string | null }) {
    const prev: Partial<Row> = { entity: r.entity, gl: r.gl, account: r.account, paymentMethodId: r.paymentMethodId, lines: r.lines, category: r.category };
    patch(r.id, { ...fields, auto: false, exception: undefined, reason: "Coded — review & post" });
    try {
      const res = await fetch("/api/payables/post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id, approve: false,
          entity: fields.entity ?? r.entity,
          gl: fields.gl ?? r.gl,
          account: fields.account ?? r.account,
          paymentMethodId: (fields.paymentMethodId ?? r.paymentMethodId) ?? null,
          bcCategory: fields.bcCategory ?? null,
          posting: (fields.posting ?? r.posting) ?? undefined,
          lines: fields.lines ?? r.lines,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      patch(r.id, prev);
      toast(`Couldn't save ${r.vendor} — try the drawer`);
    }
  }
  const saveRowGl = (r: Row, gl: string) => {
    const lines = (r.lines && r.lines.length ? r.lines : [{ desc: r.sub || r.vendor, amount: r.amount, gl }]).map((l) => ({ ...l, gl }));
    saveRowFields(r, { gl, lines });
  };
  const saveRowPayFrom = (r: Row, label: string) => {
    // "Bill — pay later" = unpaid A/P: clear the payment method and post as a Bill (Jacob,
    // 2026-06-20: "if we have a bill, there should be no payment method"). Picking a real card/bank
    // instead means it's already paid → post as an Expense (charge). Posting type and payment method
    // are kept in lockstep so a Bill can never carry a payment method.
    if (label === BILL_OPTION) {
      saveRowFields(r, { account: "unpaid", paymentMethodId: null, posting: "bill" });
      return;
    }
    const acct = accounts.find((a) => a.label === label);
    saveRowFields(r, { account: label, paymentMethodId: acct?.id ?? null, posting: "charge" });
  };
  const saveRowBcCategory = (r: Row, cat: string) => saveRowFields(r, { gl: BC_ROUTE.gl, category: cat, bcCategory: cat });
  // Which ledger rows have their detail line expanded.
  // One coding panel open at a time (the inline replacement for the old side drawer). Expanding a
  // row also points the coding-line editor (`lines`) at it via setDrawerId so the inline panel seeds.
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleExpand = (id: string) => {
    setExpandedRow((cur) => (cur === id ? null : id));
    setDrawerId(id);
  };

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const clearSel = () => setSelected(new Set());
  async function postBatch(ids: string[]) {
    if (!ids.length) return;
    // A row must be COMPLETE before it can post — pay-from, the coded account, and (travel) the
    // ticket # / no open exception. Never post an incomplete row.
    const notReady = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is Row => !!r && !rowReady(r));
    if (notReady.length) {
      const missing = [...new Set(notReady.flatMap((r) => missingBits(r)))].join(", ");
      toast(`Not ready to post — ${notReady.length} row${notReady.length === 1 ? "" : "s"} missing: ${missing}`);
      const cat = notReady.find((r) => needsCategory(r));
      if (cat) setVendorEdit({ name: cat.vendor, entity: cat.entity });
      return;
    }
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

  // Pay-from labels. The pool is all synced entities; the picker for a row is scoped to
  // THAT entity + personal (PER), entity-first — payFromForEntity. acctLabels (all) is only
  // for the entity-agnostic surfaces (bulk edit, CSV-import default).
  const acctLabels = useMemo(() => accounts.map((a) => a.label), [accounts]);
  const acctLabelsFor = (entity?: string | null) => payFromForEntity(accounts, entity).map((a) => a.label);
  // Deduped vendor names across all entities — only for the entity-agnostic bulk-edit datalist.
  // The per-row drawer uses VendorPicker scoped to the row's entity (vendorsForEntity).
  const vendorNames = useMemo(() => [...new Set(vendors.map((v) => v.name))].sort((a, b) => a.localeCompare(b)), [vendors]);
  // Optimistic overlay of just-set vendor categories — the `vendors` prop is server-fetched once,
  // so without this a Save in the vendor modal wouldn't clear "Set category" / the post gate until a
  // full page reload (the server DID persist it). Keyed by lowercased name (canonical + the name we
  // opened with) so the row's vendor lookup hits.
  const [catOverrides, setCatOverrides] = useState<Map<string, string>>(new Map());
  // Vendor category by lowercased name (the operator-set value on the vendor record). Drives the
  // picker's category groups AND the mandatory-before-post gate. "" = uncategorized (must be set).
  const vendorCatByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendors) {
      const k = v.name.toLowerCase();
      if (m.get(k)) continue;
      const c = vendorCatLabel(v.category);
      if (c) m.set(k, c);
    }
    for (const [k, c] of catOverrides) m.set(k, c);  // operator's just-saved category wins
    return m;
  }, [vendors, catOverrides]);
  const rowCat = (r: Row) => vendorCatByName.get((r.vendor ?? "").toLowerCase()) ?? "";
  // Travel rows have no editable vendor record (the QB vendor is the trip rollup) — they're exempt
  // from the mandatory-category gate. Everything else must carry a category before it can post.
  const needsCategory = (r: Row) => !r.tripId && !rowCat(r);
  // What a row is still MISSING before it can post — UNIVERSAL across every entity/category, so an
  // incomplete row is never shown as ready. A missing DOCUMENT is a tracked gap (doesn't block per
  // policy); everything here does. Used for the post icon, the batch gate, and the row's "not ready"
  // reason — one definition, one source of truth.
  const missingBits = (r: Row): string[] => {
    const m: string[] = [];
    if (!r.entity) m.push("entity");
    if (r.entity === "BC" ? !r.bcCategory : !(r.gl && r.gl.trim())) m.push("account");
    // Pay-from ⟺ posting type (Jacob: "Bill is unpaid only"). A Bill carries NO payment method;
    // an Expense MUST have a real pay-from. Block both contradictions.
    if (r.posting === "bill") {
      if (r.paymentMethodId) m.push("bill has a payment method");
    } else if (!r.account || /pick account|pick a card|pay-?from|^unpaid/i.test(r.account)) {
      m.push("pay-from");
    }
    if (!r.docType || /identify|unknown/i.test(r.docType)) m.push("doc-type");
    if (!r.tripId && !rowCat(r)) m.push("vendor category");           // non-travel must be categorized
    if (r.tripId && !r.invoiceNumber) m.push("ticket #");             // travel flight needs the ticket #
    // canonical vendor must equal the real merchant (non-travel; travel uses the trip-header by design)
    if (!r.tripId && r.vendorDisplay && r.vendor &&
        r.vendor.toLowerCase().trim() !== r.vendorDisplay.toLowerCase().trim()) m.push("vendor mismatch");
    if (r.exception) m.push("review");
    return m;
  };
  const rowReady = (r: Row) => missingBits(r).length === 0;
  // Default Pay-from for a row: the account resolved from the invoice card
  // (paymentMethodId) wins; else a label match within this entity's options; else the
  // first option for this entity (entity account before personal).
  const payDefault = (r: Row) => {
    const byId = accounts.find((a) => a.id === r.paymentMethodId);
    if (byId) return byId.label;
    const opts = acctLabelsFor(r.entity);
    return opts.includes(r.account) ? r.account : opts[0];
  };
  const glLabels = (entity?: string | null) =>
    glsForEntity(gls, entity).map((g) => g.fullName);
  const glGroups = (entity?: string | null) => glGroupsForEntity(gls, entity);
  const firstGl = (entity?: string | null) => glLabels(entity)[0] ?? "";
  // Is this string an actual GL account (vs. a loose parser category like "Insurance")?
  const isRealGl = (gl?: string | null) => !!gl && gls.some((g) => g.fullName === gl);
  // P4: a PROPOSED coding must follow through to the chosen entity's GL line. If the row
  // already carries a real account for this entity, use it; else try to resolve the proposed
  // category text to one of THIS entity's accounts by name; else leave BLANK (an honest
  // exception for the operator — never auto-pick a random first account on a low-confidence guess).
  const resolveProposedGl = (entity: string, r: Row): string => {
    if (entity === "BC") return BC_ROUTE.gl;
    if (isRealGl(r.gl) && glLabels(entity).includes(r.gl!)) return r.gl!;
    const want = ((isRealGl(r.gl) ? "" : r.gl) || r.category || "").toLowerCase().trim();
    if (want) {
      const opts = glsForEntity(gls, entity);
      const hit =
        opts.find((g) => (g.name ?? g.fullName).toLowerCase() === want) ||
        opts.find((g) => glShort(g.fullName).toLowerCase() === want) ||
        opts.find((g) => (g.name ?? g.fullName).toLowerCase().includes(want));
      if (hit) return hit.fullName;
    }
    return "";
  };
  const [filter, setFilter] = useState("need");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  // New/edit vendor modal — opens on a vendor name (+ the row's entity for new-vendor defaults).
  const [vendorEdit, setVendorEdit] = useState<{ name: string; entity: string | null } | null>(null);
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
  // Manually add an expense (no document) — e.g. an award ticket we never got a receipt for.
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  type AddForm = { payee: string; amount: string; entity: string; tripId: string; paymentMethodId: string; gl: string; memo: string; txnDate: string };
  const [addForm, setAddForm] = useState<AddForm>({ payee: "", amount: "", entity: "", tripId: "", paymentMethodId: "", gl: "", memo: "", txnDate: "" });
  async function addExpense() {
    if (!addForm.payee.trim()) { toast("Enter the merchant / payee"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/payables/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payee: addForm.payee.trim(),
          amount: Number(addForm.amount || 0),
          entity: addForm.entity || undefined,
          tripId: addForm.tripId || undefined,
          paymentMethodId: addForm.paymentMethodId || undefined,
          gl: addForm.gl || undefined,
          memo: addForm.memo || undefined,
          txnDate: addForm.txnDate || undefined,
        }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "failed");
      toast(`✓ Added ${addForm.payee.trim()} — code & post below`);
      setShowAdd(false);
      setAddForm({ payee: "", amount: "", entity: "", tripId: "", paymentMethodId: "", gl: "", memo: "", txnDate: "" });
      router.refresh();
    } catch (e) {
      toast(`Couldn't add: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  }
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
  // Deep-link: /payables?open=<id> opens that transaction's drawer. Lets the Travel
  // trip page (and anywhere else) open the ONE shared editor instead of duplicating it.
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get("open");
    if (open && rows.some((x) => x.id === open)) setDrawerId(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Pull fresh server data whenever the operator returns to the tab. An open tab otherwise shows a
  // snapshot from when it loaded — so coding changed elsewhere (a sweep, another device) looked like
  // "it's not updating" until a manual reload (Jacob, 2026-06-21). router.refresh() re-runs the
  // server components without a full page reload.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);
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
            gl: ent === "BC" ? BC_ROUTE.gl : (isRealGl(l.gl) && glLabels(ent).includes(l.gl) ? l.gl : resolveProposedGl(ent, r)),
            entity: ent,
            bcCategory: bc,
          }))
        : [{ desc: r.sub || r.vendor, amount: r.amount, gl: resolveProposedGl(ent, r), entity: ent, bcCategory: bc }];
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

  // The inline questions a row is asking, COMPUTED from its state (so >1 stacks naturally) in
  // priority order: duplicate → cost($0) → new vendor → missing receipt. A travel row (trip rollup
  // vendor; confirmation IS the invoice) never asks new-vendor or missing-receipt.
  function questionsFor(r: Row): RowQuestion[] {
    if (r.resolved) return [];
    const qs: RowQuestion[] = [];
    if (r.exception === "dup")
      qs.push({ kind: "duplicate", prompt: "Possible duplicate of an existing invoice.",
        options: [{ id: "discard_dup", label: "Discard duplicate" }, { id: "keep_both", label: "Keep both" }] });
    if (r.amount === 0 && !r.cost_resolved)
      qs.push({ kind: "cost_zero", prompt: "Cost is $0 — enter the amount charged to the card, or accept $0.",
        options: [{ id: "enter_amount", label: "Enter actual cost", input: "amount" }, { id: "accept_zero", label: "Accept $0" }, { id: "discard_zero", label: "Discard" }] });
    const isNewVendor = r.vendorStatus === "new" || /unknown/i.test(r.vendor || "");
    if (!r.tripId && isNewVendor)
      qs.push({ kind: "new_vendor", prompt: `New vendor ‘${r.vendorDisplay || r.vendor}’.`,
        options: [{ id: "add_vendor", label: "Add as new vendor" }, { id: "pick_vendor", label: "Pick existing →" }] });
    if (!r.tripId && r.nodoc && !r.doc_waived)
      qs.push({ kind: "missing_receipt", prompt: "No receipt on file.",
        options: [{ id: "attach_receipt", label: "Attach" }, { id: "waive_receipt", label: "No receipt needed" }] });
    return qs;
  }

  // Answer one of a row's inline questions. Attach/pick open existing UI (no server write); the rest
  // optimistically patch + persist via /resolve-question, reverting on failure.
  async function answerQuestion(r: Row, optionId: string, amount?: number) {
    if (optionId === "attach_receipt") { setShowInvoices(true); return; }
    if (optionId === "pick_vendor") { toggleExpand(r.id); return; }
    if (optionId === "discard_zero") { discardRow(r.id); return; }  // a $0 row can now be discarded
    const prev = { ...r };
    const p: Partial<Row> = {};
    if (optionId === "enter_amount" && amount != null) p.amount = amount;
    if (optionId === "enter_amount" || optionId === "accept_zero") p.cost_resolved = true;
    if (optionId === "waive_receipt") p.doc_waived = true;
    if (optionId === "add_vendor") p.vendorStatus = "accepted";
    if (optionId === "keep_both") p.exception = undefined;
    if (optionId === "discard_dup") { p.resolved = true; p.resolvedTo = "→ discarded (duplicate)"; }
    patch(r.id, p);
    try {
      const res = await fetch("/api/payables/resolve-question", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, optionId, amount }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "failed");
    } catch (e) {
      patch(r.id, prev); // revert
      toast(`Couldn't save: ${(e as Error).message}`);
    }
  }

  const counts = useMemo(() => {
    const need = rows.filter((r) => !r.auto && !r.resolved).length;
    const docs = rows.filter(missingDoc).length;
    const newv = rows.filter((r) => r.vendorStatus === "new" && !r.resolved).length;
    const err = rows.filter((r) => r.status === "error").length;
    const auto = rows.filter((r) => r.auto || r.resolved).length;
    // Ready to post = rows that are FULLY populated and would actually post (the same gate the post
    // icon + batch enforce — entity, account, pay-from, doc-type, vendor categorized & consistent,
    // no exception). A row that merely has an entity is NOT ready. One definition everywhere.
    const ready = rows.filter((r) => !r.resolved && rowReady(r));
    const readyAmt = ready.reduce((s, r) => s + r.amount, 0);
    return { need, docs, newv, err, auto, ready: ready.length, readyAmt };
  }, [rows]);

  const rowDate = (r: Row) => r.txnDate || (r.sub?.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
  // Show what it's actually CODED to (the GL leaf, e.g. "Communication") — and keep the
  // queue CONSISTENT with the drawer (P4): if the row only carries a loose parser guess
  // ("Insurance") rather than a real account, show what that guess RESOLVES to on its
  // entity; if it can't resolve, show nothing (needs coding) rather than a misleading label.
  const rowCategory = (r: Row) => {
    if (isRealGl(r.gl)) return glShort(r.gl);
    const resolved = resolveProposedGl(r.entity ?? r.recommended ?? "PER", r);
    return resolved ? glShort(resolved) : "";
  };
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
    if (filter === "newv") return r.vendorStatus === "new" && !r.resolved;
    if (filter === "err") return r.status === "error";
    if (filter === "ready") return !r.resolved && rowReady(r);
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
  // Correct the identified document type → re-run extraction with that type's spec + learn
  // (the worker honors the reextract flag the route sets). Prime Directive #10 §9.1.
  async function setDocType(id: string, docType: string) {
    if (!docType) return;
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, docType } : x)));
    try {
      await fetch("/api/payables/set-doc-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, docType }),
      });
      toast(`Type → ${docType} · re-running extraction`);
    } catch {
      toast("Couldn't set the document type");
    }
  }

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
          // apply the coding to the card we opened this from, even if it's still
          // mis-vendored — so the row you were on gets populated immediately.
          ids: [learnRow.id],
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

  // Persist an operator edit to the MERCHANT (payee) on a travel row. The QB vendor stays the
  // trip rollup; this corrects the displayed merchant + the memo when the parse mis-IDed it
  // (e.g. an Uber receipt read as "Lufthansa") — the one thing the operator couldn't fix before.
  async function persistPayee(id: string, value: string) {
    const v = value.trim();
    if (!v) return;
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, payee: v } : x)));
    try {
      await fetch("/api/payables/set-payee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payee: v }),
      });
    } catch {
      /* best-effort; local value still shows */
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
            <Button variant="secondary" onClick={() => setShowAdd(true)} title="Manually add an expense with no document (e.g. an award ticket)">
              <Plus className="h-4 w-4" /> Add expense
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
            // Exception bar — most urgent first; post errors only appear when there are any.
            ...(counts.err ? [{ key: "err", label: "Post errors", count: counts.err }] : []),
            { key: "need", label: "Needs coding", count: counts.need },
            { key: "newv", label: "New vendors", count: counts.newv },
            { key: "docs", label: "Missing receipts", count: counts.docs },
            { key: "ready", label: "Ready to post", count: counts.ready },
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
      // NOT overflow-hidden: the inline dropdown panels (vendor/account/pay-from/BC category) are
      // absolutely positioned and were being CLIPPED by the card — especially in the expanded
      // detail near the bottom (the "BC dropdown not populating" symptom). Rounded header/last-row
      // keep the corners clean without clipping.
      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[20px_14px_72px_minmax(0,1.6fr)_minmax(0,0.66fr)_minmax(0,1.35fr)_minmax(0,1.2fr)_84px_84px] gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <div />
          <div />
          <SortHead label="Date" col="date" sort={sort} onClick={toggleSort} />
          <SortHead label="Vendor" col="vendor" sort={sort} onClick={toggleSort} />
          <SortHead label="Entity" col="entity" sort={sort} onClick={toggleSort} />
          <SortHead label="Account" col="category" sort={sort} onClick={toggleSort} />
          <div>Pay-from</div>
          <SortHead label="Amount" col="amount" sort={sort} onClick={toggleSort} align="right" />
          <div className="text-right">Trip·doc·post</div>
        </div>
        {visible.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-400">
            Nothing here — every transaction is documented. 🎉
          </div>
        ) : (
          visible.map((r, _i) => (
            <Fragment key={r.id}>
            <div
              style={{ borderLeft: `3px solid ${r.status === "error" || r.exception === "dup" ? "#ef4444" : "transparent"}` }}
              className={`grid grid-cols-[20px_14px_72px_minmax(0,1.6fr)_minmax(0,0.66fr)_minmax(0,1.35fr)_minmax(0,1.2fr)_84px_84px] items-start gap-2.5 border-b border-slate-200/70 px-4 py-3 last:border-0 hover:bg-brand/[0.05] ${_i % 2 === 1 ? "bg-slate-100" : "bg-white"}`}
            >
              {/* select */}
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand"
                checked={selected.has(r.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSel(r.id)}
              />
              {/* expand detail */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
                title="Expand: memo · invoice # · doc-type · posting · split · actions"
                className="mt-px text-[14px] leading-none text-slate-400 hover:text-brand"
              >
                {expandedRow === r.id ? "▾" : "▸"}
              </button>
              {/* Date — editable inline as PLAIN TEXT (MM/DD/YY), no native date-picker graphic.
                  w-full (NOT a fixed width) so it stays inside its 72px grid column instead of
                  overflowing into the vendor cell; aligned to the row top like every other cell
                  (Jacob, 2026-06-21). The QB TxnDate; persists via /api/payables/set-date. */}
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  defaultValue={fmtMDY(rowDate(r))}
                  title="Transaction date (MM/DD/YY) — click to edit"
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  onBlur={(e) => { const iso = parseMDY(e.target.value, rowDate(r)); if (iso && iso !== rowDate(r)) persistDate(r.id, iso); else e.target.value = fmtMDY(rowDate(r)); }}
                  className="w-full rounded border border-transparent bg-transparent px-0.5 py-px text-[12px] tabular-nums text-slate-500 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-100"
                />
              </div>
              {/* Vendor */}
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  {r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? (
                    <span title="New / unverified vendor — confirm before posting" className="shrink-0 font-bold text-amber-600">●</span>
                  ) : (
                    <span title="On file in your vendor master" className="shrink-0 font-bold text-emerald-600">✓</span>
                  )}
                  <div className="min-w-0 flex-1">
                    {r.tripId ? (
                      // Travel: the QB vendor is the trip rollup, so show + EDIT the PAYEE (merchant).
                      // Editable so the operator can fix a mis-IDed merchant (e.g. an Uber receipt that
                      // parsed as "Lufthansa") right on the row — the QB vendor stays the trip header.
                      <input
                        type="text"
                        defaultValue={r.payee || r.vendor}
                        title={`Merchant (payee) · QB vendor: ${r.vendor}`}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (r.payee || r.vendor)) persistPayee(r.id, v); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="block w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-slate-800 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-100"
                      />
                    ) : (
                      <VendorPicker
                        value={r.vendorDisplay ?? r.vendor}
                        options={vendors}
                        entity={r.entity}
                        cats={vendorCatByName}
                        onPick={(v) => { if (v && v !== r.vendor) persistVendor(r.id, v); }}
                        onAddNew={(v) => { persistVendor(r.id, v); setVendorEdit({ name: v, entity: r.entity }); }}
                      />
                    )}
                  </div>
                  {/* edit / new vendor record — one click from the row (not just the expand). Hidden
                      for travel rows (the QB vendor is the trip rollup, not an editable record). */}
                  {!r.tripId && (
                    <button
                      aria-label={r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? "New vendor" : "Edit vendor"}
                      title={r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? "New vendor — fill from invoice" : "Edit vendor (category, contact, default coding)"}
                      onClick={(e) => { e.stopPropagation(); setVendorEdit({ name: r.vendor, entity: r.entity }); }}
                      className="shrink-0 text-slate-300 hover:text-brand"
                    >
                      {r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? <Plus className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {/* No trip badge here — travel is shown by the single plane toggle (right) + the
                      QB-vendor rollup line; a badge here was a third, redundant travel icon. */}
                  {/* Travel rows: the confirmation IS the invoice (accepted on the Travel app) — never "no receipt". */}
                  {!r.tripId && (r.doc_waived ? <Badge tone="neutral">no receipt</Badge> : r.nodoc ? <Badge tone="amber">no receipt</Badge> : null)}
                  {r.status === "error" ? <Badge tone="red">Post failed</Badge> : null}
                </div>
              </div>
              {/* Entity — LOCKED for travel rows (set by the trip; change it on the Travel page) */}
              <div onClick={(e) => e.stopPropagation()}>
                {r.tripId ? (
                  <span title="Set by the trip — change it on the Travel page" className="inline-flex items-center gap-1 px-1 py-0.5 text-[12px] font-medium text-slate-500">
                    <Lock className="h-3 w-3 opacity-50" /> {r.entity ?? "—"}
                  </span>
                ) : (r.lines?.length ?? 0) > 1 ? (
                  <button onClick={() => toggleExpand(r.id)} title="Multiple line items — expand to allocate by entity/GL">
                    <Badge tone="indigo">Split ⋯</Badge>
                  </button>
                ) : (
                  <MiniPicker
                    value={r.entity ?? ""}
                    options={entityCodes.map((c) => ({ value: c, label: c }))}
                    onPick={(v) => { if (v) codeRowInline(r, v); }}
                    placeholder="set…"
                    title="Entity (which QuickBooks file)"
                  />
                )}
              </div>
              {/* Account. BC = the operator-coded Paylocity CATEGORY (editable; the GL is auto
                  Loan–Builders Capital). Non-BC travel = the trip's GL, locked. Non-travel = GL picker. */}
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                {r.entity === "BC" ? (
                  // BC, travel or not: pick the Paylocity category — posts to Loan – Builders Capital.
                  <SearchSelect value={r.bcCategory ?? matchBcCategory(r.category ?? r.gl)} options={bcCategories} onPick={(c) => saveRowBcCategory(r, c)} placeholder="Paylocity category…" tone="amber" />
                ) : r.tripId ? (
                  <span title="Set by the trip — change it on the Travel page" className="inline-flex max-w-full items-center gap-1 px-1 py-0.5 text-[12px] font-medium text-slate-500">
                    <Lock className="h-3 w-3 shrink-0 opacity-50" /> <span className="truncate">{glShort(r.gl) || "travel"}</span>
                  </span>
                ) : (r.lines?.length ?? 0) > 1 ? (
                  <button onClick={() => toggleExpand(r.id)} className="text-[12px] text-slate-500">Multiple ⋯</button>
                ) : (
                  <AccountPicker value={glLabels(r.entity).includes(r.gl ?? "") ? (r.gl ?? "") : ""} gls={gls} entity={r.entity} onPick={(gl) => saveRowGl(r, gl)} />
                )}
              </div>
              {/* Pay-from — a backend placeholder like "Card ••5001 (pick account)" means UNSET;
                  show the empty "Pay-from…" prompt, not the placeholder string. */}
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <SearchSelect value={r.posting === "bill" ? BILL_OPTION : (/pick account|pick a card/i.test(r.account ?? "") ? "" : (r.account ?? ""))} options={[BILL_OPTION, ...acctLabelsFor(r.entity)]} onPick={(a) => saveRowPayFrom(r, a)} placeholder="Pay-from…" />
              </div>
              {/* Amount */}
              {/* Amount — editable inline (a parse error, or a travel-imported $0 seat charge the
                  operator needs to price). Persists via /api/payables/set-amount. */}
              <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                <span className="text-[13px] font-semibold text-slate-400">$</span>
                <input
                  inputMode="decimal"
                  defaultValue={r.amount ? r.amount.toFixed(2) : ""}
                  placeholder="0.00"
                  title="Amount — click to edit"
                  onBlur={(e) => { const n = Number(e.target.value.replace(/[^0-9.]/g, "")); if (Number.isFinite(n) && Math.abs(n - (r.amount ?? 0)) > 0.005) persistAmount(r.id, n); }}
                  className="w-[78px] rounded border border-transparent bg-transparent px-0.5 py-0.5 text-right text-[13px] font-semibold tabular-nums text-slate-900 outline-none transition hover:border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-100"
                />
              </div>
              {/* Trip · doc · post — the trip picker (plane), the source doc, and a per-row post icon */}
              <div className="flex items-center justify-end gap-2.5" onClick={(e) => e.stopPropagation()}>
                <TripPickerButton tripId={r.tripId ?? null} trips={trips} onPick={(id) => setTrip(r.id, id)} />
                {r.docUrl ? (
                  <a href={r.docUrl} target="_blank" rel="noopener noreferrer" title={r.tripId ? "Open the confirmation (the invoice)" : "Open the filed invoice"} className="text-brand hover:text-brand-navy"><FileText className="h-4 w-4" /></a>
                ) : r.tripId ? (
                  <span title="Confirmation is the invoice — not yet filed (the worker files it)" className="text-slate-300"><FileText className="h-4 w-4" strokeDasharray="2 2" /></span>
                ) : r.doc_waived ? (
                  <span title="No receipt needed" className="text-slate-300"><FileText className="h-4 w-4" /></span>
                ) : (
                  <span title="No receipt on file" className="text-amber-500"><FileText className="h-4 w-4" /></span>
                )}
                {!r.resolved && (
                  rowReady(r) ? (
                    <button title="Post to QuickBooks" onClick={() => postBatch([r.id])} disabled={posting}
                      className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40">
                      <UploadCloud className="h-[18px] w-[18px]" />
                    </button>
                  ) : (
                    // Not ready — never show it as postable; say what's missing.
                    <span title={`Not ready — needs ${missingBits(r).join(", ")}`} className="cursor-not-allowed text-slate-300">
                      <UploadCloud className="h-[18px] w-[18px]" />
                    </span>
                  )
                )}
              </div>
            </div>
            {/* Travel: the QB vendor (trip rollup) is too long for the column, so it spans full-width
                beneath the COLLAPSED row. When expanded it moves into the drawer's line 1 (so the
                drawer stays two lines), so suppress this standalone span while open. */}
            {r.tripId && expandedRow !== r.id && (
              <div className={`-mt-1 border-b border-slate-200/70 px-4 pb-2 pl-[116px] ${_i % 2 === 1 ? "bg-slate-100" : "bg-white"}`}>
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-0.5 text-[12px] text-indigo-700">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">QB vendor</span>
                  <span className="truncate">{r.vendor}</span>
                </span>
              </div>
            )}
            {(() => {
              const qs = questionsFor(r);
              return qs.length > 0 ? (
                <div className="border-b border-slate-200/70 px-4 pb-2 pl-[34px]" onClick={(e) => e.stopPropagation()}>
                  {qs.map((q, qi) => (
                    <InlineQuestion key={q.kind} q={q} index={qs.length > 1 ? qi + 1 : undefined}
                      onAnswer={(opt, amt) => answerQuestion(r, opt, amt)} />
                  ))}
                </div>
              ) : null;
            })()}
            {expandedRow === r.id && (
              <div className={`border-b border-slate-200/70 px-4 py-2 pl-[34px] ${_i % 2 === 1 ? "bg-slate-100" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
                {/* LINE 1 — TRAVEL ONLY: the QB-vendor (trip rollup) chip + actions. Non-travel shows
                    the vendor + edit pencil in the MAIN row, so its drawer is a single classification
                    line (two rows total) — its category + actions live on line 2 below. */}
                {r.tripId && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-0.5 text-[12px] text-indigo-700">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">QB vendor</span>
                      <span className="truncate">{r.vendor}</span>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">{actionCell(r)}</span>
                  </div>
                )}
                {/* LINE 2 — classification (memo wide · invoice # · doc-type · posting · category · split).
                    The top divider/spacing only applies when LINE 1 is above it (travel); non-travel
                    sits flush under the main row (no extra line, no gap). */}
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${r.tripId ? "mt-2 border-t border-slate-100 pt-2" : ""}`}>
                  <span className="flex min-w-[260px] flex-1 items-center gap-1.5">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Memo</span>
                    <input key={`memo-${r.id}-${r.memo ?? ""}`} defaultValue={r.memo ?? ""} placeholder="+ memo"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.memo ?? "")) persistMemo(r.id, v); }}
                      className="h-8 min-w-0 flex-1 rounded bg-transparent px-2 text-[13px] hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand/30" />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Inv #</span>
                    <input key={`inv-${r.id}-${r.invoiceNumber ?? ""}`} defaultValue={r.invoiceNumber ?? ""} placeholder="—"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.invoiceNumber ?? "")) persistInvoice(r.id, v); }}
                      className="h-8 w-32 rounded bg-transparent px-2 text-[13px] hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand/30" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Doc-type</span>
                    <DocTypeCombobox value={r.docType ?? ""} options={docTypes} onChange={(dt) => setDocType(r.id, dt)} />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Posting</span>
                    {(() => {
                      const opts = postingOptionsForEntity(r.entity);
                      const cur = opts.some((o) => o.value === r.posting) ? (r.posting as string) : "charge";
                      return (
                        <MiniPicker value={cur} options={opts}
                          onPick={(v) => saveRowFields(r, { posting: v as PayableRow["posting"] })} />
                      );
                    })()}
                  </span>
                  {/* mandatory vendor category — moved here from the removed vendor line (non-travel). */}
                  {!r.tripId && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Category</span>
                      {rowCat(r) ? (
                        <button onClick={() => setVendorEdit({ name: r.vendor, entity: r.entity })}
                          title="Edit vendor category"
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200">{rowCat(r)}</button>
                      ) : (
                        <button onClick={() => setVendorEdit({ name: r.vendor, entity: r.entity })}
                          className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">Set category</button>
                      )}
                    </span>
                  )}
                  {!r.tripId && (
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {drawerId === r.id && lines.length <= 1 && (
                        <button onClick={addLine} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">＋ Split</button>
                      )}
                      {actionCell(r)}
                    </span>
                  )}
                </div>
                {/* Split editor — only when actually split (non-travel). */}
                {!r.tripId && drawerId === r.id && lines.length > 1 && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Coding · {lines.length} lines</div>
                      <button onClick={combineLines} className="text-[11px] font-semibold text-slate-500 hover:text-brand">⤺ Combine to one</button>
                    </div>
                    {true && (
                      <div className="space-y-2">
                        {lines.map((l, i) => (
                          <div key={i} className="rounded-lg border border-slate-200 bg-white p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{l.desc}</span>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-[11px] text-slate-400">$</span>
                                <input type="number" step="0.01" value={l.amount} onChange={(e) => setLineAmount(i, parseFloat(e.target.value) || 0)} className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[12px] tabular-nums focus:border-brand focus:outline-none" />
                                <button onClick={() => removeLine(i)} title="Remove line" className="px-1 text-slate-300 hover:text-red-500">×</button>
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {entityCodes.map((c) => (
                                <button key={c} onClick={() => setLineEntity(i, c)} title={entName(c)} className={`inline-flex h-6 min-w-[2.2rem] items-center justify-center rounded px-1.5 text-[11px] font-bold transition ${l.entity === c ? "bg-brand-navy text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"}`}>{c}</button>
                              ))}
                            </div>
                            <div className="mt-1.5">
                              {l.entity === "BC" ? (
                                <SearchSelect value={l.bcCategory ?? matchBcCategory(r.category ?? r.gl)} options={bcCategories} onPick={(c) => setLineBcCategory(i, c)} placeholder="Paylocity category…" tone="amber" />
                              ) : (
                                <AccountPicker value={glLabels(l.entity).includes(l.gl) ? l.gl : ""} gls={gls} entity={l.entity} onPick={(gl) => setLineGl(i, gl)} />
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <button onClick={addLine} className="text-[12px] font-semibold text-brand hover:underline">+ Add line</button>
                          {(() => { const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100; const off = Math.abs(sum - r.amount) > 0.01; return <span className={`text-[11px] ${off ? "font-semibold text-amber-600" : "text-slate-400"}`}>lines {money(sum)} {off ? `≠ ${money(r.amount)}` : "= invoice ✓"}</span>; })()}
                        </div>
                        <button onClick={() => saveRowFields(r, { lines: lines as Row["lines"], entity: lines[0]?.entity ?? r.entity, gl: lines[0]?.gl ?? r.gl })} className="mt-1 rounded-md bg-brand-navy px-3 py-1 text-[12px] font-semibold text-white hover:opacity-90">Save split</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </Fragment>
          ))
        )}
      </div>
      )}
      {filter !== "log" && (
      <p className="mt-3 text-right text-[11px] text-slate-400">
        Code each field inline. Click a row (or ▸) to expand: memo · invoice # · doc-type · posting · splits · actions.
      </p>
      )}

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

      {/* Manually add an expense (no document) — e.g. an award ticket with no receipt */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add expense"
        width="max-w-lg"
        footer={
          <>
            <Button onClick={addExpense} disabled={adding}>{adding ? "Adding…" : "Add to queue"}</Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </>
        }
      >
        <p className="mb-3 text-[12.5px] text-slate-500">
          For an expense with no document (e.g. an award ticket). It enters the coding queue and posts like any other.
        </p>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <label className="col-span-2 block">
            <span className={DLBL}>Merchant / payee</span>
            <input value={addForm.payee} onChange={(e) => setAddForm({ ...addForm, payee: e.target.value })}
              placeholder="Delta Air Lines" className="w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className={DLBL}>Amount charged</span>
            <input value={addForm.amount} onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
              inputMode="decimal" placeholder="0.00" className="w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums" />
          </label>
          <label className="block">
            <span className={DLBL}>Date</span>
            <input type="date" value={addForm.txnDate} onChange={(e) => setAddForm({ ...addForm, txnDate: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className={DLBL}>Entity</span>
            <select value={addForm.entity} onChange={(e) => setAddForm({ ...addForm, entity: e.target.value, paymentMethodId: "", gl: "" })}
              className="w-full rounded border border-slate-300 px-2 py-1.5">
              <option value="">—</option>
              {ACTIVE_ENTITIES.map((en) => <option key={en.code} value={en.code}>{en.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={DLBL}>Trip (optional)</span>
            <select value={addForm.tripId} onChange={(e) => setAddForm({ ...addForm, tripId: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5">
              <option value="">— none —</option>
              {trips.map((t) => <option key={t.tripId} value={t.tripId}>{t.dest || t.header} · {t.dates}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={DLBL}>Pay from</span>
            <select value={addForm.paymentMethodId} onChange={(e) => setAddForm({ ...addForm, paymentMethodId: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5">
              <option value="">—</option>
              {payFromForEntity(accounts, addForm.entity).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={DLBL}>GL account</span>
            <select value={addForm.gl} onChange={(e) => setAddForm({ ...addForm, gl: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-1.5">
              <option value="">—</option>
              {glsForEntity(gls, addForm.entity).map((g) => <option key={g.id} value={g.fullName}>{g.fullName}</option>)}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className={DLBL}>Memo</span>
            <input value={addForm.memo} onChange={(e) => setAddForm({ ...addForm, memo: e.target.value })}
              placeholder="Award ticket · BOI–MCO" className="w-full rounded border border-slate-300 px-2 py-1.5" />
          </label>
        </div>
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
            {vendorNames.map((v) => (
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

      {vendorEdit && (
        <VendorModal
          name={vendorEdit.name}
          entity={vendorEdit.entity}
          gls={gls}
          onClose={() => setVendorEdit(null)}
          onSaved={(nm, cat, orig) => {
            setVendorEdit(null);
            if (cat) setCatOverrides((m) => {
              const next = new Map(m);
              next.set(nm.toLowerCase(), cat);
              if (orig) next.set(orig.toLowerCase(), cat);  // also the name the row uses
              return next;
            });
            toast(`✓ Saved vendor ${nm}`);
          }}
        />
      )}

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

    // Reclassify-to-Travel removed — the detail's Trip picker does this directly.
    const travelBtn = null;

    // Coded (entity + GL set) but not yet an auto-coded exception and not posted
    // — e.g. coded from a learned vendor. Review the charge, then post.
    if (!r.exception && r.entity)
      // Coded & ready — no label/button here; posting is the row's cloud icon + the batch button.
      return travelBtn;

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
    if (r.exception === "vendor" && !r.tripId)
      return (
        <>
          <Chip solid onClick={() => setLearnId(r.id)}>
            {r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? "Learn vendor" : "Edit vendor"}
          </Chip>
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
              <span className="block truncate text-[12.5px] font-semibold text-slate-900">{(r.vendorDisplay ?? r.vendor)} — invoice</span>
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

        {/* For a TRAVEL charge the QB vendor is the trip rollup; the real merchant (payee)
            is what was actually paid — show it explicitly, don't bury it. */}
        {r.vendorDisplay && r.vendorDisplay !== r.vendor && (
          <div>
            <div className={DLBL}>Payee (merchant paid)</div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-900">{r.vendorDisplay}</div>
          </div>
        )}

        {/* vendor — searchable picker scoped to THIS entity's QuickBooks vendors (+ master),
            with add-a-new-vendor. BC borrows PER's list (it posts into PER). */}
        <div>
          <div className={DLBL}>{r.vendorDisplay && r.vendorDisplay !== r.vendor ? "Vendor (QuickBooks name)" : "Vendor"}</div>
          <VendorPicker
            key={r.id}
            value={r.vendor}
            options={vendors}
            entity={r.entity}
            cats={vendorCatByName}
            onPick={(v) => { if (v && v !== r.vendor) persistVendor(r.id, v); }}
            onAddNew={(v) => { persistVendor(r.id, v); setVendorEdit({ name: v, entity: r.entity }); }}
          />
          {r.vendor && (
            <button onClick={() => setVendorEdit({ name: r.vendor, entity: r.entity })}
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">
              <Pencil className="h-3 w-3" /> Edit vendor details
            </button>
          )}
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
            <SearchSelect value={payFrom} options={acctLabelsFor(r.entity)} onPick={setPayFrom} placeholder="Search cards / accounts…" />
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
                      <SearchSelect
                        value={l.bcCategory ?? matchBcCategory(r.category ?? r.gl)}
                        options={bcCategories}
                        onPick={(c) => setLineBcCategory(i, c)}
                        placeholder="Search Paylocity categories…"
                        tone="amber"
                      />
                    </>
                  ) : (
                    <AccountPicker
                      value={glLabels(l.entity).includes(l.gl) ? l.gl : ""}
                      gls={gls}
                      entity={l.entity}
                      onPick={(gl) => setLineGl(i, gl)}
                    />
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
        {/* Travel rows: the QB vendor is the trip rollup, auto-created by the trip — not an
            editable vendor record. Don't offer Learn/Edit vendor for them. */}
        {!r.tripId && (
          <Button className="flex-1" variant="secondary" onClick={() => setLearnId(r.id)}>
            {r.vendorStatus === "new" || /unknown/i.test(r.vendor || "") ? "Learn vendor…" : "Edit vendor…"}
          </Button>
        )}
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

/**
 * Searchable document-type picker — replaces the unusable 222-row native <select>.
 * Click opens a small popover with a search box + scrollable, category-grouped list
 * (~10 rows visible). The row's CURRENT type is always shown/selectable even if it
 * isn't in the catalog (so a learned/unregistered type is never invisible).
 */
function DocTypeCombobox({
  value, options, onChange,
}: { value: string; options: DocTypeOption[]; onChange: (dt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = options.find((o) => o.docType === value);
  const currentLabel = current?.label ?? (value ? value : "");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = options.filter((o) =>
      !needle || o.label.toLowerCase().includes(needle) || o.docType.toLowerCase().includes(needle) || o.category.toLowerCase().includes(needle));
    const byCat = new Map<string, DocTypeOption[]>();
    for (const o of filtered) { const a = byCat.get(o.category) ?? []; a.push(o); byCat.set(o.category, a); }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [options, q]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => { setOpen((v) => !v); setQ(""); }}
        title="Identified document type — correct it to re-run extraction with the right spec"
        className={`flex max-w-[200px] items-center gap-1 truncate rounded px-1 py-0.5 text-[13px] hover:bg-slate-100 ${
          value ? "text-slate-700" : "text-amber-600"}`}>
        <span className="truncate">{currentLabel || "— identify type —"}</span>
        <span className="shrink-0 text-[10px] text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-max min-w-[288px] max-w-[420px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-1.5">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search types…"
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-blue-300" />
          </div>
          <div className="max-h-96 overflow-y-auto py-1">
            <button onClick={() => { onChange(""); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-slate-400 hover:bg-slate-50">— identify type —</button>
            {value && !current && (
              <button onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between bg-blue-50/50 px-3 py-1.5 text-left text-[12px] text-slate-700">
                <span className="truncate">{value}</span><span className="text-[10px] text-blue-500">current</span>
              </button>
            )}
            {groups.length === 0 ? (
              <div className="px-3 py-3 text-center text-[12px] text-slate-400">No types match.</div>
            ) : groups.map(([cat, opts]) => (
              <div key={cat}>
                <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cat}</div>
                {opts.map((o) => (
                  <button key={o.docType} onClick={() => { onChange(o.docType); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-slate-50 ${
                      o.docType === value ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"}`}>
                    <span className="whitespace-normal break-words">{o.label}</span>
                    {o.docType === value && <span className="text-[11px] text-blue-500">✓</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Searchable, ENTITY-SCOPED vendor picker. Shows only the row entity's QuickBooks vendors
// (+ canonical master), search by name, and "Add '…' as a new {entity} vendor" when nothing
// matches. Mirrors DocTypeCombobox's open/outside-click pattern. (vendorsForEntity scopes;
// BC borrows PER.) match-before-create still runs at post, so a near-dupe reuses the existing.
function VendorPicker({
  value, options, entity, onPick, onAddNew, cats,
}: { value: string; options: VendorOption[]; entity?: string | null; onPick: (v: string) => void; onAddNew?: (v: string) => void; cats?: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [showCopy, setShowCopy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const firstLetter = (n: string) => { const c = (n.trim()[0] ?? "").toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };

  const names = useMemo(() => vendorsForEntity(options, entity), [options, entity]);
  const entLabel = entName(entity);
  const needle = q.trim().toLowerCase();
  // Category of a name ("" → Uncategorized). Jump-chips let you filter to one category.
  const catOf = (n: string) => cats?.get(n.toLowerCase()) || "Uncategorized";
  const catChips = useMemo(() => {
    if (!cats) return [];
    const set = new Set<string>();
    names.forEach((n) => set.add(catOf(n)));
    return [...set].sort((a, b) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, cats]);
  // The A–Z letters actually present among this entity's vendors (enable only those).
  const presentLetters = useMemo(() => {
    const s = new Set<string>();
    names.forEach((n) => s.add(firstLetter(n)));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);
  const hits = useMemo(
    () => names
      .filter((n) => !needle || n.toLowerCase().includes(needle))
      .filter((n) => !activeCat || catOf(n) === activeCat)
      .filter((n) => !activeLetter || firstLetter(n) === activeLetter)
      .slice(0, 300),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, needle, activeCat, activeLetter, cats],
  );
  // Group hits by category for the grouped (chips) view.
  const hitGroups = useMemo(() => {
    if (!cats) return [] as [string, string[]][];
    const m = new Map<string, string[]>();
    for (const n of hits) { const c = catOf(n); (m.get(c) ?? m.set(c, []).get(c)!).push(n); }
    return [...m.entries()].sort((a, b) => (a[0] === "Uncategorized" ? 1 : b[0] === "Uncategorized" ? -1 : a[0].localeCompare(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, cats]);
  // Vendors that exist in OTHER entities but NOT this one — pick to COPY here (the vendor is
  // created in this entity's QBO realm at post via match-before-create). name → source entities.
  // Filtered by the SAME search + category + letter controls (there are too many to list raw),
  // and surfaced behind a toggle so it never floods the main list.
  const code = entity === "BC" ? "PER" : entity;
  const others = useMemo(() => {
    const have = new Set(names.map((n) => n.toLowerCase()));
    const m = new Map<string, Set<string>>();
    for (const v of options) {
      if (!v.entity || v.entity === code || v.entity === null) continue;
      if (have.has(v.name.toLowerCase())) continue;
      if (needle && !v.name.toLowerCase().includes(needle)) continue;
      if (activeCat && catOf(v.name) !== activeCat) continue;
      if (activeLetter && firstLetter(v.name) !== activeLetter) continue;
      (m.get(v.name) ?? m.set(v.name, new Set()).get(v.name)!).add(v.entity);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, names, code, needle, activeCat, activeLetter, cats]);
  const exact = names.some((n) => n.toLowerCase() === needle);
  const raw = q.trim();

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen((v) => !v); setQ(""); }}
        className="flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[12.5px] text-slate-800 hover:bg-slate-100 focus:outline-none">
        <span className={`truncate ${value ? "" : "text-slate-400"}`}>{value || "Search vendors…"}</span>
        <span className="shrink-0 text-[10px] text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-max min-w-[320px] max-w-[440px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-1.5">
            <div className="mb-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{entLabel} vendors · {names.length}</div>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${entLabel} vendors…`}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-brand" />
            {cats && catChips.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button onClick={() => setActiveCat(null)}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${!activeCat ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>All</button>
                {catChips.map((c) => (
                  <button key={c} onClick={() => setActiveCat(c === activeCat ? null : c)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${activeCat === c ? "bg-brand text-white" : c === "Uncategorized" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{c}</button>
                ))}
              </div>
            )}
            {/* A–Z index — combine with the category chips + search. Letters with no vendor are disabled. */}
            <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
              <button onClick={() => setActiveLetter(null)}
                className={`rounded px-1.5 text-[11px] font-semibold ${!activeLetter ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-100"}`}>All</button>
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("").map((L) => {
                const has = presentLetters.has(L);
                return (
                  <button key={L} disabled={!has} onClick={() => setActiveLetter(L === activeLetter ? null : L)}
                    className={`w-[18px] rounded text-center text-[11px] font-semibold ${
                      activeLetter === L ? "bg-brand text-white" : has ? "text-slate-600 hover:bg-slate-100" : "cursor-default text-slate-300"}`}>{L}</button>
                );
              })}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {hits.length === 0 && others.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">No {entLabel} vendor matches.</div>
            ) : cats ? (
              hitGroups.map(([c, ns]) => (
                <div key={c}>
                  <div className={`px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide ${c === "Uncategorized" ? "text-amber-600" : "text-slate-400"}`}>{c}</div>
                  {ns.map((n) => (
                    <button key={n} onClick={() => { onPick(n); setOpen(false); }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${n === value ? "bg-brand/5 font-medium text-brand-navy" : "text-slate-700"}`}>
                      <span className="whitespace-normal break-words">{n}</span>
                      {n === value && <span className="shrink-0 text-[11px] text-brand">✓</span>}
                    </button>
                  ))}
                </div>
              ))
            ) : hits.map((n) => (
              <button key={n} onClick={() => { onPick(n); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${n === value ? "bg-brand/5 font-medium text-brand-navy" : "text-slate-700"}`}>
                <span className="whitespace-normal break-words">{n}</span>
                {n === value && <span className="shrink-0 text-[11px] text-brand">✓</span>}
              </button>
            ))}
            {others.length > 0 && (
              <div className="mt-1 border-t border-slate-100">
                {/* Collapsed by default — there are too many across entities to list raw. The
                    search + category + A–Z controls above filter THIS list too. */}
                <button onClick={() => setShowCopy((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-50">
                  <span>Copy from another entity · {others.length}{others.length === 200 ? "+" : ""}</span>
                  <span className="text-[11px] text-slate-300">{showCopy ? "▾ hide" : "▸ show"}</span>
                </button>
                {showCopy && (
                  (needle || activeCat || activeLetter) ? (
                    others.map(([n, ents]) => (
                      <button key={`o-${n}`} onClick={() => { onPick(n); setOpen(false); }}
                        title={`In ${[...ents].map((e) => entName(e)).join(", ")} — copy to ${entLabel}`}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50">
                        <span className="whitespace-normal break-words">{n}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{[...ents].slice(0, 2).join(", ")}{ents.size > 2 ? ` +${ents.size - 2}` : ""} →</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11.5px] text-slate-400">Search or pick a category / letter to narrow these {others.length}{others.length === 200 ? "+" : ""} vendors.</div>
                  )
                )}
              </div>
            )}
          </div>
          {raw && !exact && (
            <button onClick={() => { (onAddNew ?? onPick)(raw); setOpen(false); }}
              className="flex w-full items-center gap-1.5 border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-[12.5px] font-medium text-brand hover:bg-brand/5">
              <Plus className="h-3.5 w-3.5" /> Add “{raw}” as a new {entLabel} vendor…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Borderless mini dropdown (value ▾ → popover list, no search) for small fixed lists — Entity,
// Posting. Same borderless trigger as pay-from so every dropdown reads identically.
function MiniPicker({
  value, options, onPick, placeholder = "set…", title,
}: { value: string; options: { value: string; label: string }[]; onPick: (v: string) => void; placeholder?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const cur = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" title={title} onClick={() => setOpen((v) => !v)}
        className={`flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] hover:bg-slate-100 focus:outline-none ${cur ? "text-slate-800" : "font-normal text-amber-600"}`}>
        <span className="truncate">{cur?.label ?? placeholder}</span>
        <span className="shrink-0 text-[10px] text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[170px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <button key={o.value} onClick={() => { onPick(o.value); setOpen(false); }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 ${o.value === value ? "bg-brand/5 font-medium text-brand-navy" : "text-slate-700"}`}>
              <span className="truncate">{o.label}</span>{o.value === value && <span className="text-[11px] text-brand">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Trip picker — a plane icon that opens a search + chip-filtered (entity · year · month) trip list.
const _MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function TripPickerButton({ tripId, trips, onPick }: { tripId: string | null; trips: TripOption[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ent, setEnt] = useState<string | null>(null);
  const [yr, setYr] = useState<string | null>(null);
  const [mo, setMo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const moOf = (t: TripOption) => { const m = (t.start || "").slice(5, 7); return m ? _MONTHS[(+m) - 1] : ""; };
  const yrOf = (t: TripOption) => (t.start || "").slice(0, 4);
  const ents = useMemo(() => [...new Set(trips.map((t) => t.entity).filter(Boolean) as string[])].sort(), [trips]);
  const years = useMemo(() => [...new Set(trips.map(yrOf).filter(Boolean))].sort().reverse(), [trips]);
  const months = useMemo(() => { const p = new Set(trips.map(moOf).filter(Boolean)); return _MONTHS.filter((m) => p.has(m)); }, [trips]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => trips.filter((t) =>
    (!needle || (t.dest || t.header || "").toLowerCase().includes(needle))
    && (!ent || t.entity === ent) && (!yr || yrOf(t) === yr) && (!mo || moOf(t) === mo)
  ).slice(0, 200), [trips, needle, ent, yr, mo]);
  const chip = (active: boolean) => `rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;
  const lbl = "mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400";
  return (
    <div ref={ref} className="relative inline-flex">
      {/* The plane is the travel TOGGLE/indicator: FILLED (solid) when the row is on a trip, faint
          outline when not. Click it to attach / change / make-not-travel via the menu below. */}
      <button type="button" title={tripId ? "On a trip — click to change or make not travel" : "Attach to a trip"}
        onClick={() => setOpen((v) => !v)}
        className={tripId
          ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-navy"
          : "inline-flex text-slate-300 hover:text-brand"}>
        <Plane className={tripId ? "h-3 w-3" : "h-4 w-4"} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-5 w-[330px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trips by destination…"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[13px] outline-none focus:border-brand" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className={lbl}>Entity</div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setEnt(null)} className={chip(!ent)}>All</button>
                  {ents.map((e) => <button key={e} onClick={() => setEnt(e === ent ? null : e)} className={chip(ent === e)}>{e}</button>)}
                </div>
              </div>
              <div>
                <div className={lbl}>Year</div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setYr(null)} className={chip(!yr)}>All</button>
                  {years.map((y) => <button key={y} onClick={() => setYr(y === yr ? null : y)} className={chip(yr === y)}>{y}</button>)}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <div className={lbl}>Month</div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setMo(null)} className={chip(!mo)}>All</button>
                {months.map((m) => <button key={m} onClick={() => setMo(m === mo ? null : m)} className={chip(mo === m)}>{m}</button>)}
              </div>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {hits.length === 0 ? <div className="px-3 py-2 text-[12px] text-slate-400">No trips match.</div> :
              hits.map((t) => (
                <button key={t.tripId} onClick={() => { onPick(t.tripId); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 ${t.tripId === tripId ? "bg-brand/5 font-medium text-brand-navy" : "text-slate-700"}`}>
                  <span className="truncate">{t.dest ? `${t.dest} · ${t.dates}` : t.header}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{t.entity}</span>
                </button>
              ))}
          </div>
          <button onClick={() => { onPick(""); setOpen(false); }}
            className={`block w-full border-t border-slate-100 px-3 py-2 text-left text-[12px] hover:bg-slate-50 ${tripId ? "font-medium text-rose-600" : "text-slate-500"}`}>
            {tripId ? "✕ Make not travel — back to Payables" : "— Not a trip —"}</button>
        </div>
      )}
    </div>
  );
}

// Flat searchable picker (pay-from cards, BC Paylocity categories). Type to filter, click to pick.
function SearchSelect({
  value, options, onPick, placeholder = "Search…", tone = "navy",
}: { value: string; options: string[]; onPick: (v: string) => void; placeholder?: string; tone?: "navy" | "amber" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => options.filter((o) => !needle || o.toLowerCase().includes(needle)).slice(0, 300), [options, needle]);
  const t = tone === "amber"
    ? { border: "border-amber-200", text: "text-amber-800", hl: "bg-amber-50 text-amber-800" }
    : { border: "border-slate-200", text: "text-brand-navy", hl: "bg-brand/5 text-brand-navy" };
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => { setOpen((v) => !v); setQ(""); }}
        className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[12px] hover:bg-slate-100 ${value ? t.text : ""}`}>
        <span className={`truncate ${value ? "font-medium" : "font-normal text-amber-600"}`}>{value || placeholder}</span>
        <span className="shrink-0 text-[10px] text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-max min-w-[300px] max-w-[420px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-1.5">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {hits.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">No match.</div>
            ) : hits.map((o) => (
              <button key={o} onClick={() => { onPick(o); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${o === value ? `font-medium ${t.hl}` : "text-slate-700"}`}>
                <span className="whitespace-normal break-words">{o}</span>
                {o === value && <span className="text-[11px] text-brand">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// P&L class of a GL type → [rank, section label]. Order: Expenses → Income → Assets → Liabilities
// → Equity → Bank. Drives the section ordering in the GL account picker.
function glClass(type?: string | null): [number, string] {
  switch (type) {
    case "Cost of Goods Sold": return [11, "Cost of sales"];
    case "Expense": return [12, "Operating expenses"];
    case "Other Expense": return [13, "Other expenses"];
    case "Income": return [20, "Income"];
    case "Other Income": return [21, "Other income"];
    case "Other Current Liability":
    case "Long Term Liability":
    case "Accounts Payable": return [40, "Liabilities"];
    case "Equity": return [50, "Equity"];
    case "Bank":
    case "Credit Card":
    case "Cash": return [60, "Bank & cash"];
    default: return [30, "Assets"]; // Other Current Asset, Fixed Asset, Other Asset, A/R
  }
}

// Searchable GL account picker — codeable accounts (P&L-ordered) by default; an exception toggle
// reveals the entity's full chart. Leaf names + account number, search on either.
function AccountPicker({
  value, gls, entity, onPick,
}: { value: string; gls: GlOption[]; entity?: string | null; onPick: (gl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const code = entity === "BC" ? "PER" : entity;
  const codeable = useMemo(() => glsForEntity(gls, entity), [gls, entity]);
  const fullChart = useMemo(() => (code ? gls.filter((g) => g.entity === code) : gls), [gls, code]);
  const pool = all ? fullChart : codeable;
  const needle = q.trim().toLowerCase();
  // P&L-class jump-chips (Cost of sales · Operating expenses · …) — present classes, in rank order.
  const classChips = useMemo(() => {
    const seen = new Map<string, number>();
    pool.forEach((g) => { const [rank, label] = glClass(g.type); if (!seen.has(label)) seen.set(label, rank); });
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  }, [pool]);
  const items = useMemo(() => pool
    .filter((g) => !needle || glShort(g.fullName).toLowerCase().includes(needle) || (g.number ?? "").includes(needle))
    .map((g) => ({ g, leaf: glShort(g.fullName), cls: glClass(g.type) }))
    .filter(({ cls }) => !activeClass || cls[1] === activeClass)
    .sort((a, b) => a.cls[0] - b.cls[0] || (a.g.number ?? "").localeCompare(b.g.number ?? "") || a.leaf.localeCompare(b.leaf))
    .slice(0, 400), [pool, needle, activeClass]);
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => { setOpen((v) => !v); setQ(""); }}
        className={`flex w-full items-center justify-between gap-1 rounded px-1.5 py-1 text-left text-[12px] hover:bg-slate-100 ${value ? "font-medium text-slate-700" : ""}`}>
        <span className={`truncate ${value ? "" : "font-normal text-amber-600"}`}>{glShort(value) || "Set account"}</span>
        <span className="shrink-0 text-[10px] text-slate-300">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-max min-w-[340px] max-w-[440px] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-1.5">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number…"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-brand" />
            {classChips.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button onClick={() => setActiveClass(null)}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${!activeClass ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>All</button>
                {classChips.map((c) => (
                  <button key={c} onClick={() => setActiveClass(c === activeClass ? null : c)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${activeClass === c ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{c}</button>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {items.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">No match{all ? "" : " — try the exception toggle"}.</div>
            ) : items.map(({ g, leaf, cls }, idx) => {
              const prev = items[idx - 1];
              const head = !prev || prev.cls[1] !== cls[1];
              return (
                <div key={g.id}>
                  {head && <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cls[1]}</div>}
                  <button onClick={() => { onPick(g.fullName); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${g.fullName === value ? "bg-brand/5 font-medium text-brand-navy" : "text-slate-700"}`}>
                    {g.number && <span className="w-12 shrink-0 text-[11px] tabular-nums text-slate-400">{g.number}</span>}
                    <span className="flex-1 whitespace-normal break-words">{leaf}</span>
                    {g.fullName === value && <span className="text-[11px] text-brand">✓</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11.5px] text-slate-600">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-3.5 w-3.5" />
            Include non-coding accounts <span className="text-slate-400">· exception</span>
          </label>
        </div>
      )}
    </div>
  );
}

// New / edit vendor modal — writes the `vendors` master (name, aliases, default entity/GL
// coding, auto-approve, contact). Loads the existing record on open so a save never wipes
// aliases/defaults it didn't surface. Opened from "Edit vendor details" in the drawer.
type VContact = { email?: string; phone?: string; website?: string; account_number?: string; street?: string };
function VendorModal({
  name, entity, gls, onClose, onSaved,
}: { name: string; entity: string | null; gls: GlOption[]; onClose: () => void; onSaved: (name: string, category?: string, originalName?: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cname, setCname] = useState(name);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [ent, setEnt] = useState(entity && entity !== "BC" ? entity : "");
  const [gl, setGl] = useState("");
  const [category, setCategory] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [contact, setContact] = useState<VContact>({});

  useEffect(() => {
    let live = true;
    fetch(`/api/payables/vendor?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then(({ vendor }) => {
        if (!live) return;
        if (vendor) {
          setCname(vendor.canonical_name ?? name);
          setAliases(Array.isArray(vendor.aliases) ? vendor.aliases : []);
          setEnt(vendor.entity_code ?? (entity && entity !== "BC" ? entity : ""));
          setGl(vendor.gl_full_name ?? "");
          setCategory(vendorCatLabel(vendor.category));
          setAutoApprove(!!vendor.auto_approve);
          setContact((vendor.contact ?? {}) as VContact);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { live = false; };
  }, [name, entity]);

  const addAlias = () => {
    const a = aliasInput.trim();
    if (a && !aliases.some((x) => x.toLowerCase() === a.toLowerCase())) setAliases((xs) => [...xs, a]);
    setAliasInput("");
  };
  const c = (k: keyof VContact) => contact[k] ?? "";
  const setC = (k: keyof VContact, v: string) => setContact((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/payables/vendor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cname.trim(), originalName: name, aliases, entity: ent || null, gl: gl || null, category: category || null, autoApprove, contact }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      onSaved(cname.trim(), category, name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit vendor" width="max-w-xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || !cname.trim() || !category}>{saving ? "Saving…" : "Save vendor"}</Button>
      </>}>
      {!loaded ? (
        <div className="px-1 py-6 text-[13px] text-slate-400">Loading vendor…</div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className={DLBL}>Vendor name</div>
            <input value={cname} onChange={(e) => setCname(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
          </div>
          <div>
            <div className={DLBL}>
              Category <span className="font-bold text-red-500">*</span>
              <span className="font-normal normal-case text-slate-400"> · required before this vendor can post</span>
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-[13px] ${category ? "border-slate-200" : "border-amber-300 bg-amber-50/40"}`}>
              <option value="">— pick a category —</option>
              {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className={DLBL}>Aliases <span className="font-normal normal-case text-slate-400">· names as they appear on documents (feed vendor ID)</span></div>
            <div className="flex flex-wrap items-center gap-1.5">
              {aliases.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[12px]">
                  {a}<button onClick={() => setAliases((xs) => xs.filter((x) => x !== a))} className="text-slate-400">✕</button>
                </span>
              ))}
              <input value={aliasInput} onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                placeholder="+ add alias" className="h-7 w-28 rounded-md border border-slate-200 px-2 text-[12px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={DLBL}>Default entity</div>
              <select value={ent} onChange={(e) => { setEnt(e.target.value); setGl(""); }} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px]">
                <option value="">— none —</option>
                {ACTIVE_ENTITIES.filter((x) => x.code !== "BC").map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <div className={DLBL}>Default account</div>
              {ent ? <AccountPicker value={gl} gls={gls} entity={ent} onPick={setGl} />
                   : <div className="rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] text-slate-400">pick an entity first</div>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="h-4 w-4" />
            Auto-approve — post matching invoices without review
          </label>
          <div>
            <div className={DLBL}>Contact</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={c("email")} onChange={(e) => setC("email", e.target.value)} placeholder="Email" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
              <input value={c("phone")} onChange={(e) => setC("phone", e.target.value)} placeholder="Phone" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
              <input value={c("website")} onChange={(e) => setC("website", e.target.value)} placeholder="Website" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
              <input value={c("account_number")} onChange={(e) => setC("account_number", e.target.value)} placeholder="Our account #" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
            </div>
            <input value={c("street")} onChange={(e) => setC("street", e.target.value)} placeholder="Address" className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
          </div>
          {err && <div className="text-[12px] text-red-600">{err}</div>}
        </div>
      )}
    </Modal>
  );
}
