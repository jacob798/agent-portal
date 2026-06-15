-- 0015: protect operator-curated field specs from the seed (DB-level, authoritative).
-- The seed (seed_doc_intelligence.py) re-injects UNIVERSAL_FIELDS into every doc type. For a
-- type the operator has curated via the console (it has source='curated' fields), that CSV is
-- the authoritative spec — the seed must not re-pollute it. The seed runs from an external
-- scheduler, so the only reliable guard is here: a BEFORE INSERT trigger that drops any
-- source='seed' field insert when the target type already has curated fields. (Curated wins,
-- same governance as 'learned'.)

create or replace function public.block_seed_on_curated_fields()
returns trigger as $$
begin
  if new.source = 'seed' and exists (
    select 1 from public.doc_type_fields
    where doc_type = new.doc_type and source = 'curated'
  ) then
    return null;  -- skip: this doc type is operator-curated
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_block_seed_on_curated on public.doc_type_fields;
create trigger trg_block_seed_on_curated
  before insert on public.doc_type_fields
  for each row execute function public.block_seed_on_curated_fields();
