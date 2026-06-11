-- Canonical vendor master in Supabase (post-Azure: all formerly-local JSON lives
-- in the cloud for all agents). Replaces data/config/shared/vendor_master.json as
-- the source of truth. `record` holds the full nested vendor record (identity,
-- recognition, contacts, account_identifiers); the flat columns denormalize the
-- queryable bits (matching, default coding).
create table if not exists public.vendors (
  vendor_id       text primary key,          -- v_000065
  canonical_name  text not null,
  aliases         text[] default '{}',
  accepted        boolean default false,     -- operator-confirmed / curated
  auto_added      boolean default true,      -- parser guess until accepted
  entity_code     text,                      -- default coding
  gl_full_name    text,
  auto_approve    boolean default false,     -- tier-2 trust (post automatically)
  contact         jsonb default '{}'::jsonb, -- street/city/state/zip/phone/email/website/account_number
  record          jsonb,                     -- full nested record (fidelity for readers)
  updated_at      timestamptz default now()
);
create index if not exists vendors_canonical_idx on public.vendors (lower(canonical_name));

alter table public.vendors enable row level security;
do $$ begin
  create policy vendors_read on public.vendors for select using (true);
exception when duplicate_object then null; end $$;
