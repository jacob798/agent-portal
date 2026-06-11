-- The deterministic template-learning needs the field VALUES of the invoice the
-- operator edited, so the next invoice from the same vendor can swap old→new values
-- in their edited text (no LLM). memo_format now holds the literal edited memo.
alter table public.vendor_memo_formats add column if not exists sample_values jsonb;
