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

export const ACCTS = [
  "AMEX WJW Business ••1004",
  "AMEX Foundry Business ••1005",
  "AMEX Delta Reserve ••5001",
  "Citibank ••4658",
  "Wells Fargo Checking",
  "Charles Schwab Checking",
];

export const GLS = [
  "6120 Materials",
  "6140 Sm Tools",
  "6200 Software",
  "6300 Repairs & Maint",
  "6420 Internet",
  "6710 Travel — Meals",
  "6720 Travel — Ground",
  "6730 Travel — Airfare",
  "6900 Office / Admin",
  "7800 Personal",
];

export const money = (n: number): string =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
