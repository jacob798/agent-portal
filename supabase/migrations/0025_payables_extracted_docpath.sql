-- Carry the FULL parsed identifying set through to the row (nothing the parser
-- extracts gets silently dropped at the mapping layer), plus the Dropbox file PATH
-- so the post_runner can fetch the PDF bytes and attach the file to the QBO txn.
alter table public.payables_queue add column if not exists extracted jsonb;
alter table public.payables_queue add column if not exists doc_path text;
