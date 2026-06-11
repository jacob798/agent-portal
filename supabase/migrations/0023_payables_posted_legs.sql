-- Per-leg idempotency for the post_runner: which posting legs of an invoice have
-- already been written to QuickBooks (so a partial failure on a two-QB
-- intercompany invoice can't double-post the first leg).
alter table public.payables_queue add column if not exists posted_legs jsonb default '[]'::jsonb;
