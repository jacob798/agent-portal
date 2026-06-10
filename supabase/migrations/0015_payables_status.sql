-- Lifecycle of a payables row through the operator.
--   open      → in the queue, needs coding/confirmation
--   approved  → operator approved the coding; staged for the QBO batch post
--   posted    → written to QuickBooks (set by the backend post_runner)
-- The portal's "Approve & post" persists the confirmed coding and sets
-- status='approved'; the backend batch checkpoint flips it to 'posted'.
alter table public.payables_queue add column if not exists status text default 'open';
alter table public.payables_queue add column if not exists approved_at timestamptz;
alter table public.payables_queue add column if not exists posted_at timestamptz;
