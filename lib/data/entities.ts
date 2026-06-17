/** Shared entity / account / GL reference + money helper used by the agent modules. */

export const ENTITIES = ["BC", "FC", "PER", "WJW"] as const;
export type EntityCode = (typeof ENTITIES)[number];

export const ENT: Record<string, string> = {
  BC: "Builders Capital",
  FC: "Foundry Capital",
  PER: "Personal",
  WJW: "WJW Investments",
  WB12: "Waterbrook 1 & 12",
  IOTA: "Iota Street",
  PC: "Prestwick Capital",
  PFB: "Prestwick Funding B",
  SEL: "Selkirk Management",
  UNK: "Unknown",
};

/**
 * Every ACTIVE entity an operator can code a trip/expense to (CLAUDE.md entity reference).
 * Inactive (FI, PIL), archived (POC), and the UNK fallback are intentionally excluded from
 * pickers. Single source of truth for the New-Trip picker AND the trips filter, so the two
 * never drift (they used to be a hardcoded 4 / a derived-from-data subset).
 */
export const ACTIVE_ENTITIES: { code: string; label: string }[] = [
  { code: "BC", label: "Builders Capital" },
  { code: "FC", label: "Foundry Capital" },
  { code: "PER", label: "Personal" },
  { code: "WJW", label: "WJW Investments" },
  { code: "WB12", label: "Waterbrook 1 & 12" },
  { code: "IOTA", label: "Iota Street" },
  { code: "PC", label: "Prestwick Capital" },
  { code: "PFB", label: "Prestwick Funding B" },
  { code: "SEL", label: "Selkirk Management" },
];

export const entName = (c?: string | null): string =>
  (c && ENT[c]) || (c ?? "Unknown");

/**
 * BC (Builders Capital) is an employer reimbursement, not a P&L entity. Its
 * expenses post to the PER QuickBooks file against the balance-sheet account
 * "Loan - Builders Capital", cleared later by the Paylocity deposit. The
 * operator can't retag a BC charge to a different *expense* GL — coding for BC
 * is fixed by this route. (Two-QB intercompany rule, CLAUDE.md.)
 */
export const BC_ROUTE = {
  qbEntity: "PER",
  gl: "Loan - Builders Capital",
  note: "BC expense → posts to Personal (PER) QB as Loan – Builders Capital (balance sheet). Cleared by the Paylocity reimbursement.",
} as const;

/** Client-safe shapes for the config the drawers receive as props. */
export interface PayAccount {
  id: string;
  label: string;
  type: string | null;
  status: string;
  entity: string | null;
  lastFour: string | null;
}
export interface GlOption {
  id: string;
  entity: string;
  number: string | null;
  name: string | null;
  fullName: string;
  type: string | null;
}

// An account is CODEABLE (a valid expense-coding target) when it's a P&L type — Expense,
// Cost of Goods Sold, Other Expense — or a Fixed Asset, or a capitalized-cost account (the
// "Capitalized … Costs" 130xxx dev series, typed Other Current Asset, where construction
// costs land instead of P&L). Everything else (pay-from banks/cards, income, A/R, A/P,
// equity, liabilities, loans-receivable / investment / retirement assets) is NOT something
// you code a payable to, so it's kept out of the dropdown. New expense accounts synced from
// QBO appear automatically — this pattern is the only manual gate. (Jacob, 2026-06-16.)
const CODEABLE_GL_TYPES = new Set(["Expense", "Cost of Goods Sold", "Other Expense", "Fixed Asset"]);
export function isCodeableGl(g: GlOption): boolean {
  return CODEABLE_GL_TYPES.has(g.type ?? "") || /capitaliz/i.test(g.fullName);
}

/** GL coding options for a given entity — codeable accounts only. BC borrows PER's chart
 *  (it posts into PER; its own coding is fixed to Loan – Builders Capital via BC_ROUTE). */
export function glsForEntity(gls: GlOption[], entity?: string | null): GlOption[] {
  const code = entity === "BC" ? "PER" : entity;
  const codeable = gls.filter(isCodeableGl);
  if (!code) return codeable;
  const scoped = codeable.filter((g) => g.entity === code);
  return scoped.length ? scoped : codeable;
}

/**
 * Pay-from options for a row's entity: the SELECTED ENTITY's own payment accounts +
 * the PERSONAL (PER) accounts — the shared AMEX/Citi cards live only in PER but are
 * pay-from for any entity (the charge posts on PER, the entity gets the intercompany
 * Bill). BC posts into PER, so it shows PER only. Sort: entity-own accounts FIRST,
 * then personal — and dedupe by id so a PER-coded row doesn't list PER twice.
 * (Jacob, 2026-06-16 — project_payment_methods_payfrom.)
 */
export function payFromForEntity(accounts: PayAccount[], entity?: string | null): PayAccount[] {
  // Within a group, lead with credit cards (the common pay method), then bank/checking, then cash.
  const typeRank = (t: string | null) =>
    /credit/i.test(t ?? "") ? 0 : /cash/i.test(t ?? "") ? 2 : 1;
  const sortGroup = (xs: PayAccount[]) =>
    [...xs].sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.label.localeCompare(b.label));
  const code = entity === "BC" ? "PER" : entity;
  if (!code || code === "PER") return sortGroup(accounts.filter((a) => a.entity === "PER"));
  const own = sortGroup(accounts.filter((a) => a.entity === code));
  const per = sortGroup(accounts.filter((a) => a.entity === "PER"));
  const seen = new Set(own.map((a) => a.id));
  // entity-own first, then personal — cards-first within each.
  return [...own, ...per.filter((a) => !seen.has(a.id))];
}

export interface GlGroup {
  label: string; // parent/header path
  options: { value: string; label: string }[]; // value = full name, label = leaf
}

/**
 * GL accounts grouped for a clean dropdown: QuickBooks full names are
 * "Parent:Child" where the parent is a summary header (not postable). We group
 * by the parent path, show only the leaf as the option, and drop header
 * accounts (any name that is a strict prefix of another) from the choices.
 */
export function glGroupsForEntity(gls: GlOption[], entity?: string | null): GlGroup[] {
  const scoped = glsForEntity(gls, entity);
  const isHeader = (name: string) =>
    scoped.some((g) => g.fullName !== name && g.fullName.startsWith(name + ":"));
  const order: string[] = [];
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const g of scoped) {
    if (isHeader(g.fullName)) continue; // summary header — not postable
    const i = g.fullName.lastIndexOf(":");
    const parent = i >= 0 ? g.fullName.slice(0, i) : "General";
    const leaf = i >= 0 ? g.fullName.slice(i + 1) : g.fullName;
    if (!groups.has(parent)) {
      groups.set(parent, []);
      order.push(parent);
    }
    groups.get(parent)!.push({ value: g.fullName, label: leaf });
  }
  return order.map((label) => ({ label, options: groups.get(label)! }));
}

/** A known vendor tagged with the entity (QB realm) it belongs to. entity=null = a canonical
 *  `vendors`-master name not tied to one realm (addable anywhere). vendor_qbo_refs is per-entity,
 *  so the SAME name can appear under several entities. `category` is the operator-set vendor
 *  category (mandatory before posting), stored on the master record (`record.identity.primary_category`).
 *  `gl` is the master default GL (legacy signal). */
export interface VendorOption {
  name: string;
  entity: string | null;
  gl?: string | null;
  category?: string | null;
}

/**
 * The vendor-category vocabulary. Stored on the vendor record and REQUIRED before a vendor's
 * invoice can post. Used by the vendor edit modal (the picker) and to group the vendor picker.
 * Existing vendors are backfilled by an LLM pull; new ones must be set by the operator.
 */
export const VENDOR_CATEGORIES: string[] = [
  "Travel",
  "Software & subscriptions",
  "Utilities & telecom",
  "Insurance",
  "Meals & entertainment",
  "Office & supplies",
  "Professional services",
  "Construction & materials",
  "Financial & fees",
  "Marketing & advertising",
  "Rent & facilities",
  "Shipping & postage",
  "Other",
];

/** Normalize a stored category slug (e.g. "event_ticketing", "travel") to a display label. */
export function vendorCatLabel(raw?: string | null): string {
  if (!raw) return "";
  const t = raw.trim();
  if (!t) return "";
  const exact = VENDOR_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  return t.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Whether each ENTITY supports A/P Bills (drives the Posting options: Expense / Bill / Check).
 *  BC posts as a Purchase into PER and PER itself has no A/P here, so neither offers "Bill".
 *  Sourced from entity_master.accounting.supports_bills. */
export const ENTITY_SUPPORTS_BILLS: Record<string, boolean> = {
  FC: true, WJW: true, WB12: true, IOTA: true, PC: true, PFB: true, SEL: true, FI: true, PIL: true,
  BC: false, PER: false, POC: false, UNK: false,
};

/** Posting options valid for an entity: Expense (Purchase) and Check are always available;
 *  Bill only where A/P is supported. (Point 6 — validated per entity.) */
export function postingOptionsForEntity(entity?: string | null): { value: "charge" | "bill" | "check"; label: string }[] {
  const bills = entity ? ENTITY_SUPPORTS_BILLS[entity] !== false : true;
  const opts: { value: "charge" | "bill" | "check"; label: string }[] = [{ value: "charge", label: "Expense" }];
  if (bills) opts.push({ value: "bill", label: "Bill" });
  opts.push({ value: "check", label: "Check" });
  return opts;
}

/** Vendors for a given entity: that entity's own QuickBooks vendors + the canonical master names
 *  (entity=null, addable anywhere), deduped by name, sorted. BC borrows PER's vendor list (it
 *  posts into PER). Mirrors glsForEntity / payFromForEntity so the three pickers scope alike. */
export function vendorsForEntity(vendors: VendorOption[], entity?: string | null): string[] {
  const code = entity === "BC" ? "PER" : entity;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of vendors) {
    if (code && v.entity !== code && v.entity !== null) continue;
    const k = v.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v.name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Short, de-duplicated label for a stored GL full name (leaf only). */
export function glShort(fullName?: string | null): string {
  if (!fullName) return "";
  const i = fullName.lastIndexOf(":");
  return i >= 0 ? fullName.slice(i + 1) : fullName;
}

export const money = (n: number): string =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
