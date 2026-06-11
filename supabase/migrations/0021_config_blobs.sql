-- Generic cloud home for the formerly-local shared config JSONs (post-Azure: all
-- local JSON moves to the cloud for all agents). Each row is one config document
-- keyed by its filename; config_loader._load_config() reads from here (file
-- fallback). Mutable *state* (the *_learning_queue files) stays in the state store,
-- not here.
create table if not exists public.config_blobs (
  name       text primary key,   -- e.g. 'entity_master.json'
  data       jsonb not null,
  updated_at timestamptz default now()
);

alter table public.config_blobs enable row level security;
do $$ begin
  create policy config_blobs_read on public.config_blobs for select using (true);
exception when duplicate_object then null; end $$;
