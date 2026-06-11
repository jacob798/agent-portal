-- Cloud home for agent STATE (post-Azure: all local JSON → cloud). The
-- shared/state RemoteStore mirrors each logical collection (e.g. travel/trips_index,
-- travel/review_queue, shared/documents_index) as one row here. Selected by
-- STATE_BACKEND=remote. The *_learning_queue and everything else under
-- data/state/ is seeded in by agents/payables/diagnostics (one-time).
create schema if not exists shared;

create table if not exists shared.state_documents (
  collection text primary key,   -- logical collection path, e.g. 'travel/trips_index'
  doc        jsonb not null,
  updated_at timestamptz default now()
);
