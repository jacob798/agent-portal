/**
 * Real coding-config reference for the agent modules: payment methods (what you
 * pay from) and the full QuickBooks chart of accounts (GL coding), both synced
 * from agent-system's data/config/shared/*.json into Supabase.
 *
 * Falls back to a small static set when Supabase isn't configured so the UI
 * still renders in dev / preview.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface PaymentMethod {
  id: string;
  label: string; // display, with •• last-4 when present
  type: string | null;
  status: string; // active | closed
  entity: string | null; // qb_entity
  lastFour: string | null;
}

export interface GlAccount {
  id: string;
  entity: string; // entity_code
  number: string | null;
  name: string | null;
  fullName: string; // value + display, e.g. "6200-Software"
  type: string | null;
}

// NO fake accounts: bank/card/GL options come ONLY from the live QuickBooks chart
// of accounts (Supabase gl_accounts). If the cloud is unreachable we show nothing
// rather than invented accounts you can't actually post to.
const FALLBACK_ACCTS: PaymentMethod[] = [];
const FALLBACK_GLS: GlAccount[] = [];


// Pay-from accounts come from the QuickBooks chart of accounts across ALL synced
// entities — bank / checking / credit-card / cash (title-disbursement included). The
// per-entity narrowing ("this entity + personal") happens in payFromForEntity().
// "Other Current Asset" is intentionally NOT a pay-type — it swept in ~25
// loans-receivable / investment accounts you never pay from.
const PAY_TYPES = new Set(["Bank", "Credit Card", "Cash"]);

// Curated exclusions: accounts that ARE a pay-type but are never operator pay-from.
// Kept as patterns (not hardcoded ids) so newly-synced QBO accounts are caught too —
// this is the ONLY manual step when a payment method is added (everything else syncs
// live from QBO). See the project_payment_methods_payfrom memory.
//   - "Expenses Payable – …": QBO types these as Credit Card, but they're the
//     intercompany CLEARING account (credit side of an entity Bill), not a card.
//   - retirement / investment: not spending accounts.
//   - the "Credit Cards" parent rollup (leaf has no card after it).
const PAYFROM_EXCLUDE = [
  /expenses payable/i,
  /retirement|401k|\bira\b|investment/i,
];
function isPayFrom(fullName: string, leaf: string): boolean {
  if (leaf.trim().toLowerCase() === "credit cards") return false; // parent rollup
  return !PAYFROM_EXCLUDE.some((re) => re.test(fullName) || re.test(leaf));
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  if (!isSupabaseConfigured()) return FALLBACK_ACCTS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("id, entity_code, account_full_name, account_name, account_type, account_number")
      .eq("is_active", true)
      .order("entity_code")
      .order("account_type")
      .order("account_number");
    if (error || !data || data.length === 0) return FALLBACK_ACCTS;
    return data
      .filter((r) => PAY_TYPES.has(r.account_type))
      .map((r) => {
        const full = String(r.account_full_name ?? r.account_name ?? r.id);
        const leaf = full.split(":").pop()!;
        return { r, full, leaf };
      })
      .filter(({ full, leaf }) => isPayFrom(full, leaf))
      .map(({ r, leaf }): PaymentMethod => {
        const l4 = (leaf.match(/\d{4,}/g) || []).map((n: string) => n.slice(-4)).pop() ?? null;
        return { id: r.id, label: leaf, type: r.account_type ?? null, status: "active", entity: r.entity_code ?? null, lastFour: l4 };
      });
  } catch {
    return FALLBACK_ACCTS;
  }
}

export async function getGlAccounts(): Promise<GlAccount[]> {
  if (!isSupabaseConfigured()) return FALLBACK_GLS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("*")
      .eq("is_active", true)
      .order("entity_code")
      .order("account_number");
    if (error || !data || data.length === 0) return FALLBACK_GLS;
    return data.map((r): GlAccount => ({
      id: r.id,
      entity: r.entity_code,
      number: r.account_number ?? null,
      name: r.account_name ?? null,
      fullName: r.account_full_name ?? r.account_name ?? r.id,
      type: r.account_type ?? null,
    }));
  } catch {
    return FALLBACK_GLS;
  }
}

const FALLBACK_BC_CATS = [
  "Meals - General",
  "Travel : General",
  "Software subscriptions expense",
  "Office Supplies",
  "Misc / Other",
];

/** BC (Builders Capital) Paylocity expense categories — captured per BC expense. */
export async function getBcCategories(): Promise<string[]> {
  if (!isSupabaseConfigured()) return FALLBACK_BC_CATS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("bc_categories").select("name").order("ord");
    if (error || !data || data.length === 0) return FALLBACK_BC_CATS;
    return data.map((r) => r.name as string);
  } catch {
    return FALLBACK_BC_CATS;
  }
}

/** Everything the coding drawers need, fetched once on the server. */
export interface CodingConfig {
  accounts: PaymentMethod[]; // active pay-from accounts only
  gls: GlAccount[]; // all active GL accounts, callers filter by entity
  bcCategories: string[]; // BC Paylocity expense categories
}

export async function getCodingConfig(): Promise<CodingConfig> {
  const [methods, gls, bcCategories] = await Promise.all([
    getPaymentMethods(),
    getGlAccounts(),
    getBcCategories(),
  ]);
  // Pay-from list excludes closed/archived accounts (e.g. Wells Fargo) and
  // the non-spending account types (investment/retirement/cash placeholders).
  const accounts = methods.filter(
    (m) => m.status === "active" && m.type !== "investment_account" && m.type !== "retirement_account",
  );
  return { accounts, gls, bcCategories };
}
