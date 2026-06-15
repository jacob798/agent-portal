-- 0018: field specs are CURATED-ONLY. The seed's per-type "prepopulated" fields were
-- placeholders, never real specs; the operator curates a real spec per type via CSV import.
-- Replace the (curated-only) guard with a blanket one: the seed may NEVER insert into
-- doc_type_fields. Types stay blank until a curated/learned spec is imported. (doc_types,
-- routing, field_dictionary still seed normally — only the placeholder FIELDS are blocked.)

create or replace function public.block_seed_on_curated_fields()
returns trigger as $$
begin
  if new.source = 'seed' then
    return null;  -- field specs are curated/learned only — never seeded
  end if;
  return new;
end;
$$ language plpgsql;
-- trigger trg_block_seed_on_curated (from 0015) already calls this function.

-- wipe the placeholder fields (keep curated/learned)
delete from public.doc_type_fields where source = 'seed';
