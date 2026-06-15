-- 0016: richer field spec — value source + canonical format.
-- The spec-builder CSV now carries two more columns:
--   value_source: document | derived | manual  (where the value comes from — NOT the governance
--                 'source' column, which stays seed|curated|learned). 'manual' = required by the
--                 business purpose but not on the page (entity, project, gl_code, business_purpose).
--   value_format: iata_code | iso_date | iso_datetime | decimal | '' (the canonical representation
--                 extraction must normalize to, so values join cleanly downstream).

alter table public.doc_type_fields add column if not exists value_source text not null default 'document';
alter table public.doc_type_fields add column if not exists value_format text;
