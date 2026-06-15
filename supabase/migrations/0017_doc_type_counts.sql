-- 0017: per-type count views. The catalog was counting fields by fetching every
-- doc_type_fields row (6.7k+) and tallying client-side, which PostgREST truncates at its
-- max-rows cap → most types showed 0 fields. Count in the DB instead (one tiny row per type).

create or replace view public.doc_type_field_counts as
  select doc_type, count(*)::int as field_count
  from public.doc_type_fields
  where canonical_name is not null
  group by doc_type;

create or replace view public.doc_type_sample_counts as
  select doc_type, count(*)::int as sample_count
  from public.documents
  where doc_type is not null
  group by doc_type;
