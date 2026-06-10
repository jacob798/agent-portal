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

export const money = (n: number): string =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
