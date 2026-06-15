-- 0019: "Populate fields from agents" flag. The console sets it; the worker drains it by writing
-- the type's spec from its routed agents' contracts (agent_contracts.materialize_doc_type).
alter table public.doc_types add column if not exists materialize boolean not null default false;
