-- Per-vendor learned memo FORMAT. When the operator manually edits a transaction's
-- memo, we store it here keyed by vendor; on the next ingest of an invoice from the
-- same vendor the LLM reproduces this format with the new invoice's data — so memos
-- stay consistently formatted the way the operator wants.
create table if not exists public.vendor_memo_formats (
  vendor       text primary key,
  memo_format  text not null,
  updated_at   timestamptz default now()
);
