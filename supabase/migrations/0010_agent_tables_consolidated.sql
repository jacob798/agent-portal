-- Agent module read tables: Payables, Travel, Bookkeeper, BC Reimbursement.
--
-- These are the portal's read contract for the four agent modules added in
-- components/{payables,travel,bookkeeper,bc}. The agent-system backend is
-- expected to populate them (directly, or via views over its per-agent
-- schemas). Columns map to the TypeScript types in lib/data/{payables,travel,
-- bookkeeper,bc}.ts via the snake_case <-> camelCase mapping in those files.
-- Nested structures (lines, legs, itin, exps) are jsonb.
--
-- Idempotent: create-if-not-exists + seed on-conflict-do-nothing. Seed rows
-- mirror the mock data so the screens render real Supabase rows immediately;
-- the backend can upsert over them by id.

-- ---------------------------------------------------------------------------
-- Payables exception queue
-- ---------------------------------------------------------------------------
create table if not exists public.payables_queue (
  id          text primary key,
  vendor      text not null,
  sub         text,
  amount      numeric not null default 0,
  posting     text check (posting in ('bill','charge')),
  account     text,
  entity      text,
  recommended text,
  exception   text check (exception in ('entity','vendor','split','dup')),
  reason      text,
  category    text,
  lines       jsonb,
  gl          text,
  auto        boolean not null default false,
  nodoc       boolean not null default false,
  ord         integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id         text primary key,
  ent        text,
  dest       text,
  dates      text,
  status     text check (status in ('open','up','closed')),
  grace      text,
  purpose    text,
  total      numeric not null default 0,
  itin       jsonb not null default '[]',
  exps       jsonb not null default '[]',
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Travel expense-attribution queue
-- ---------------------------------------------------------------------------
create table if not exists public.travel_queue (
  id         text primary key,
  ic         text,
  merchant   text,
  sub        text,
  loc        text,
  home       boolean not null default false,
  category   text,
  amount     numeric not null default 0,
  trip       text,
  suggested  boolean not null default false,
  post_trip  boolean not null default false,
  gl         text,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookkeeper posting ledger (QBO API over OAuth)
-- ---------------------------------------------------------------------------
create table if not exists public.bookkeeper_ledger (
  id         text primary key,
  status     text check (status in ('posted','ready','err','held')),
  vendor     text,
  memo       text,
  type       text check (type in ('Purchase','Bill','Deposit','Check')),
  file       text,
  sub        text,
  amount     numeric not null default 0,
  ref        text,
  gap        boolean not null default false,
  legs       jsonb,
  balnote    text,
  err        text,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Builders Capital reimbursement workspace
-- ---------------------------------------------------------------------------
create table if not exists public.bc_reimbursement (
  id         text primary key,
  grp        text check (grp in ('travel','non')),
  ic         text,
  vendor     text,
  sub        text,
  gl         text,
  glsub      text,
  amount     numeric not null default 0,
  receipt    boolean not null default false,
  included   boolean not null default true,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: authenticated read; writes via service role only.
-- ---------------------------------------------------------------------------
alter table public.payables_queue   enable row level security;
alter table public.trips            enable row level security;
alter table public.travel_queue     enable row level security;
alter table public.bookkeeper_ledger enable row level security;
alter table public.bc_reimbursement enable row level security;

drop policy if exists "authenticated read payables_queue" on public.payables_queue;
create policy "authenticated read payables_queue" on public.payables_queue for select to authenticated using (true);

drop policy if exists "authenticated read trips" on public.trips;
create policy "authenticated read trips" on public.trips for select to authenticated using (true);

drop policy if exists "authenticated read travel_queue" on public.travel_queue;
create policy "authenticated read travel_queue" on public.travel_queue for select to authenticated using (true);

drop policy if exists "authenticated read bookkeeper_ledger" on public.bookkeeper_ledger;
create policy "authenticated read bookkeeper_ledger" on public.bookkeeper_ledger for select to authenticated using (true);

drop policy if exists "authenticated read bc_reimbursement" on public.bc_reimbursement;
create policy "authenticated read bc_reimbursement" on public.bc_reimbursement for select to authenticated using (true);

-- ---------------------------------------------------------------------------

-- Ingestion jobs: the shared queue for the two document entry points (Upload + Email).
--
-- Upload entry point: the portal stores the file in the `documents` Storage bucket and
-- inserts a row here (source='upload', storage_path=...). Email entry point: the backend
-- mailbox watcher inserts rows (source='email'). A backend processor claims pending rows,
-- runs OCR/classify, files the document to Dropbox (API), writes the resulting
-- payables_queue row, and marks the job done. One pipeline, two front doors.

create table if not exists public.ingestion_jobs (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('upload','email')),
  status            text not null default 'pending'
                      check (status in ('pending','processing','done','error')),
  storage_path      text,        -- object path in the 'documents' bucket (upload)
  original_filename text,
  email_message_id  text,        -- Graph message id (email)
  uploaded_by       uuid references auth.users (id),
  result_table      text,        -- e.g. 'payables_queue'
  result_id         text,        -- id of the row the processor created
  dropbox_path      text,        -- where it was filed in Dropbox
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ingestion_jobs_status_idx on public.ingestion_jobs (status, created_at);

alter table public.ingestion_jobs enable row level security;

-- Authenticated users can see job status and create upload jobs; the backend
-- processor runs under the service role (bypasses RLS) to claim + complete them.
drop policy if exists "authenticated read ingestion_jobs" on public.ingestion_jobs;
create policy "authenticated read ingestion_jobs"
  on public.ingestion_jobs for select to authenticated using (true);

drop policy if exists "authenticated insert ingestion_jobs" on public.ingestion_jobs;
create policy "authenticated insert ingestion_jobs"
  on public.ingestion_jobs for insert to authenticated with check (source = 'upload');

-- Link from a payables row to its filed source document (Dropbox shared link).
alter table public.payables_queue add column if not exists doc_url text;
