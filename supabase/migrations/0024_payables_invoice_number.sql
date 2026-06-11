-- Invoice number captured at ingest, surfaced in the QBO memo (PrivateNote) so each
-- posted transaction carries an identifying reference beyond vendor/category.
alter table public.payables_queue add column if not exists invoice_number text;
