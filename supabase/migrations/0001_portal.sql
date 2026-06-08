-- Agent Portal read model.
--
-- The portal reads two tables for its operational views. Apply this in the
-- Supabase SQL editor (or via the Supabase CLI), then set NEXT_PUBLIC_SUPABASE_*
-- in the portal env and getAgents()/getReviewItems() switch from mock to live.
--
-- These are the portal's read contract. The agent-system backend is expected to
-- populate them (directly, or via views over its per-agent schemas). Columns map
-- 1:1 to the TypeScript types in lib/data/agents.ts and lib/data/review.ts.

-- ---------------------------------------------------------------------------
-- Agent health (one row per agent) -> dashboard
-- ---------------------------------------------------------------------------
create table if not exists public.agent_health (
  id           text primary key,
  name         text not null,
  status       text not null check (status in ('healthy','degraded','down','idle')),
  last_run_at  timestamptz,
  queue_depth  integer not null default 0,
  description  text,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Review queue (one row per item needing operator review) -> review queue
-- ---------------------------------------------------------------------------
create table if not exists public.review_queue (
  id           text primary key,
  agent        text not null,
  agent_label  text not null,
  title        text not null,
  summary      text,
  entity       text,
  amount       numeric,
  priority     text not null check (priority in ('high','medium','low')),
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id)
);

create index if not exists review_queue_status_idx on public.review_queue (status);
create index if not exists review_queue_created_idx on public.review_queue (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: any authenticated user can read; writes are restricted
-- (resolution happens through a server action under a service role / policy).
-- ---------------------------------------------------------------------------
alter table public.agent_health enable row level security;
alter table public.review_queue enable row level security;

create policy "authenticated can read agent_health"
  on public.agent_health for select
  to authenticated using (true);

create policy "authenticated can read review_queue"
  on public.review_queue for select
  to authenticated using (true);
