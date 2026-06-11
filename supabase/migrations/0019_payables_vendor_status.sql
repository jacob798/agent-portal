-- How the system knows the vendor: accepted (operator-confirmed or curated in
-- vendor_master) | on_file (in vendor_master but auto-added, unconfirmed) | new.
-- Lets the portal denote a previously-accepted vendor instead of re-flagging it.
alter table public.payables_queue add column if not exists vendor_status text default 'new';
