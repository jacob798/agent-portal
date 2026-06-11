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


// Pay-from accounts come straight from the QuickBooks chart of accounts (the PER
// payment hub) — bank / checking / credit-card / cash. No separately-maintained
// payment_methods table: you pay from a real QBO account, so it always resolves.
const PAY_TYPES = new Set(["Bank", "Credit Card", "Cash", "Other Current Asset"]);

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  if (!isSupabaseConfigured()) return FALLBACK_ACCTS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("id, account_full_name, account_name, account_type, account_number")
      .eq("entity_code", "PER")
      .eq("is_active", true)
      .order("account_type")
      .order("account_number");
    if (error || !data || data.length === 0) return FALLBACK_ACCTS;
    return data
      .filter((r) => PAY_TYPES.has(r.account_type))
      .map((r): PaymentMethod => {
        const leaf = String(r.account_full_name ?? r.account_name ?? r.id).split(":").pop()!;
        const l4 = (leaf.match(/\d{4,}/g) || []).map((n: string) => n.slice(-4)).pop() ?? null;
        return { id: r.id, label: leaf, type: r.account_type ?? null, status: "active", entity: "PER", lastFour: l4 };
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
