-- Extend vendor_rules into the full learned-vendor record: the same fields are
-- written to both the QuickBooks vendor and the Outlook contact. Captured in the
-- Learn-vendor modal; the backend pushes them to QBO + Graph.
alter table public.vendor_rules add column if not exists display_name   text;
alter table public.vendor_rules add column if not exists email          text;
alter table public.vendor_rules add column if not exists phone          text;
alter table public.vendor_rules add column if not exists website        text;
alter table public.vendor_rules add column if not exists street         text;
alter table public.vendor_rules add column if not exists city           text;
alter table public.vendor_rules add column if not exists state          text;
alter table public.vendor_rules add column if not exists zip            text;
alter table public.vendor_rules add column if not exists terms          text;
alter table public.vendor_rules add column if not exists account_number text;
