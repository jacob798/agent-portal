-- Real config reference for the coding drawers: payment methods + the full
-- QuickBooks chart of accounts, plus a writable vendor-rules store so the
-- "always code this way" toggle persists (the agent-system processor reads it
-- as an override layer; vendor_master.json stays the seed/source of truth).
--
-- Synced from data/config/shared/{payment_methods,general_ledger_master}.json
-- by agents/payables/diagnostics/sync_config_to_supabase.py.

create table if not exists public.payment_methods (
  id              text primary key,           -- payment_method_id (pm_000006)
  display_name    text not null,
  type            text,                       -- credit_card | bank_account | check | ...
  status          text default 'active',      -- active | closed (closed = archived)
  qb_entity       text,                       -- QB file the account lives in
  owner_entity    text,
  last_four       text,                        -- active_last_four, shown in the UI
  qb_account_name text,
  qb_account_type text,                       -- Bank | CreditCard | ...
  multi_entity_use boolean default false,
  ord             int default 0
);

create table if not exists public.gl_accounts (
  id                text primary key,         -- gl_account_id (FC_001)
  entity_code       text not null,            -- FC | WJW | PER | IOTA | ...
  account_number    text,
  account_name      text,
  account_full_name text not null,            -- "001-Checking Wells Fargo" (display + value)
  account_type      text,                     -- Bank | Expense | ...
  detail_type       text,
  is_active         boolean default true
);
create index if not exists gl_accounts_entity_idx on public.gl_accounts (entity_code);

-- Writable override layer for "always code <vendor> this way".
create table if not exists public.vendor_rules (
  vendor          text primary key,           -- normalized vendor display name
  entity_code     text,
  gl_full_name    text,
  pay_method_id   text,
  source          text default 'portal',      -- portal | vendor_master
  updated_at      timestamptz default now()
);

-- These are reference tables read by the signed-in operator; RLS open-read,
-- writes go through the service role (vendor_rules) like the other agent tables.
alter table public.payment_methods enable row level security;
alter table public.gl_accounts     enable row level security;
alter table public.vendor_rules    enable row level security;

do $$ begin
  create policy pm_read  on public.payment_methods for select using (true);
  create policy gl_read  on public.gl_accounts     for select using (true);
  create policy vr_read  on public.vendor_rules    for select using (true);
exception when duplicate_object then null; end $$;
