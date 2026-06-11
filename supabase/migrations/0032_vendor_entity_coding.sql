-- Per-(vendor, entity) GL coding. Vendor IDENTITY/contact stays global (vendors /
-- vendor_rules — "the learning one"); the GL is ENTITY-SPECIFIC because every company
-- has its own chart. When a known vendor appears in a NEW entity, we PREDICT its GL by
-- mapping the GL it uses in another entity onto this entity's chart (by account name).
create table if not exists public.vendor_entity_coding (
  vendor       text not null,
  entity_code  text not null,
  gl           text,                 -- account_full_name in THIS entity's chart
  auto_approve boolean default false,
  updated_at   timestamptz default now(),
  primary key (vendor, entity_code)
);
create index if not exists vendor_entity_coding_vendor_idx on public.vendor_entity_coding (lower(vendor));
