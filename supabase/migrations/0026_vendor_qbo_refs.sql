-- QBO is the source of truth for vendors, per company (like the chart of accounts).
-- Each entity's QuickBooks vendor list is synced here so ingestion can match an
-- invoice's vendor against what already exists in that QB file (match-before-create,
-- no duplicates) and the portal can show/choose real vendors. Picks up manual QBO
-- renames/merges on the next sync.
create table if not exists public.vendor_qbo_refs (
  entity_code   text not null,
  qbo_vendor_id text not null,
  display_name  text,
  norm_name     text,           -- normalized for matching (suffixes/punctuation stripped)
  active        boolean default true,
  synced_at     timestamptz default now(),
  primary key (entity_code, qbo_vendor_id)
);
create index if not exists vendor_qbo_refs_norm_idx on public.vendor_qbo_refs (entity_code, norm_name);
