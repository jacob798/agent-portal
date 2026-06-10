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

const FALLBACK_ACCTS: PaymentMethod[] = [
  { id: "pm_000006", label: "AMEX - WJW Business ••1004", type: "credit_card", status: "active", entity: "PER", lastFour: "1004" },
  { id: "pm_000008", label: "AMEX - Foundry Business ••1005", type: "credit_card", status: "active", entity: "PER", lastFour: "1005" },
  { id: "pm_000007", label: "AMEX - Delta Reserve ••5001", type: "credit_card", status: "active", entity: "PER", lastFour: "5001" },
  { id: "pm_000009", label: "Citibank ••4658", type: "credit_card", status: "active", entity: "PER", lastFour: "4658" },
];

const FALLBACK_GLS: GlAccount[] = [
  { id: "x1", entity: "FC", number: "6200", name: "Software", fullName: "6200 Software", type: "Expense" },
  { id: "x2", entity: "FC", number: "6420", name: "Internet", fullName: "6420 Internet", type: "Expense" },
  { id: "x3", entity: "PER", number: "7800", name: "Personal", fullName: "7800 Personal", type: "Expense" },
  { id: "x4", entity: "WJW", number: "6120", name: "Materials", fullName: "6120 Materials", type: "Expense" },
  { id: "x5", entity: "WJW", number: "6140", name: "Small Tools", fullName: "6140 Sm Tools", type: "Expense" },
];

function labelFor(displayName: string, lastFour: string | null): string {
  // payment_methods display_name already reads e.g. "AMEX - WJW Business (1004)".
  // Normalize the trailing (1004) to •• form for consistency with the queue.
  if (lastFour && displayName.includes(`(${lastFour})`)) {
    return displayName.replace(`(${lastFour})`, `••${lastFour}`).replace(/\s+/g, " ").trim();
  }
  if (lastFour && !displayName.includes(lastFour)) return `${displayName} ••${lastFour}`;
  return displayName;
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  if (!isSupabaseConfigured()) return FALLBACK_ACCTS;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .order("ord");
    if (error || !data || data.length === 0) return FALLBACK_ACCTS;
    return data.map((r): PaymentMethod => ({
      id: r.id,
      label: labelFor(r.display_name, r.last_four ?? null),
      type: r.type ?? null,
      status: r.status ?? "active",
      entity: r.qb_entity ?? null,
      lastFour: r.last_four ?? null,
    }));
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
