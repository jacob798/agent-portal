-- Dedup keys: doc_hash = sha256 of the source file (exact re-upload);
-- dedupe_key = vendor|amount|date (same invoice from a different file/channel).
alter table public.payables_queue add column if not exists doc_hash text;
alter table public.payables_queue add column if not exists dedupe_key text;
create index if not exists payables_doc_hash_idx on public.payables_queue (doc_hash);
create index if not exists payables_dedupe_idx on public.payables_queue (dedupe_key);
