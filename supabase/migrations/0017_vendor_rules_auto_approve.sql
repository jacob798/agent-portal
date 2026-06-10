-- Two tiers of vendor trust:
--   (default)            future invoices auto-CODE but the operator reviews + posts
--   auto_approve = true  future invoices auto-APPROVE (skip review, post automatically)
-- Set only when the operator explicitly checks "approve all going forward".
alter table public.vendor_rules add column if not exists auto_approve boolean default false;
