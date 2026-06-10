-- Link from a payables row to its filed source document (Dropbox shared link).
alter table public.payables_queue add column if not exists doc_url text;
