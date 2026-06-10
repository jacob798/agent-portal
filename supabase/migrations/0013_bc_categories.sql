-- BC (Builders Capital) Paylocity expense categories. Every BC expense needs a
-- Paylocity category captured for the reimbursement report (separate from the
-- PER-QB posting, which is fixed to Loan - Builders Capital). Synced from
-- data/config/shared/bc_expense_config.json by sync_config_to_supabase.py.

create table if not exists public.bc_categories (
  name text primary key,   -- exact Paylocity category name
  ord  int default 0
);

-- The captured BC category on a payables row (drives the Paylocity expense report).
alter table public.payables_queue add column if not exists bc_category text;

alter table public.bc_categories enable row level security;
do $$ begin
  create policy bc_cat_read on public.bc_categories for select using (true);
exception when duplicate_object then null; end $$;
