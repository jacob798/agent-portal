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
  SEL: "Selkirk Management",
  UNK: "Unknown",
};

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

/** GL options for a given entity. BC borrows PER's chart (it posts into PER). */
export function glsForEntity(gls: GlOption[], entity?: string | null): GlOption[] {
  const code = entity === "BC" ? "PER" : entity;
  if (!code) return gls;
  const scoped = gls.filter((g) => g.entity === code);
  return scoped.length ? scoped : gls;
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
