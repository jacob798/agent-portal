-- Per-vendor invoice-FORMAT templates for deterministic, LLM-free extraction.
-- The template is LEARNED from the vision-LLM parse (we locate each extracted value
-- in the OCR text and record the anchor next to it). On a later invoice from the same
-- vendor we extract the header fields deterministically and only fall back to the LLM
-- when the template misses or a value fails validation.
--   status: learning  → still recording anchors (LLM still authoritative)
--           shadow     → extracting + comparing to the LLM (not trusted yet)
--           promoted   → template-only (LLM skipped) after enough clean agreements
create table if not exists public.vendor_templates (
  vendor        text primary key,
  fingerprint   jsonb,            -- {name_tokens:[], anchors:[], domain}
  field_anchors jsonb,            -- {field: {label, regex, kind}}
  sample_count  int default 0,    -- how many invoices have trained it
  agree_count   int default 0,    -- consecutive shadow agreements with the LLM
  status        text default 'learning',
  updated_at    timestamptz default now()
);
