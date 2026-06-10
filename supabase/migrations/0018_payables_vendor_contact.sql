-- Structured vendor contact captured at ingest (from vendor_master / the
-- invoice) so the Learn-vendor modal prefills name, address, phone, website,
-- and our account number — the data is on the invoice, no reason to retype it.
alter table public.payables_queue add column if not exists vendor_contact jsonb;
