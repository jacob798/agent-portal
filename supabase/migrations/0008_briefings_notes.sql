-- Briefings: captured voice notes / recorded meetings awaiting review.
--
-- Entry point: the Voicenotes webhook (app/api/webhooks/voicenotes) inserts a row
-- per recording (status='new'). The backend briefings agent claims new rows, runs
-- the splitter/matcher, and writes the held DRAFTS back (status='planned'). The
-- operator reviews in the Briefings module and approves (status='confirmed' with
-- the kept/edited drafts); the agent then posts to Pipedrive/Asana (status='written').
-- Nothing posts until the operator approves.

create table if not exists public.briefings_notes (
  id           uuid primary key default gen_random_uuid(),
  source_id    text unique not null,          -- Voicenotes note id (idempotency key)
  title        text default '',
  transcript   text not null,
  event        text default '',               -- recording.created | recording.updated
  status       text not null default 'new'
                 check (status in ('new','split','planned','confirmed','written','skipped','error')),
  drafts       jsonb not null default '[]'::jsonb,   -- held per-deal + personal drafts
  skip_reason  text,
  received_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists briefings_notes_status_idx on public.briefings_notes (status, received_at);

alter table public.briefings_notes enable row level security;

-- Authenticated operators read drafts and confirm them; the webhook + backend
-- agent run under the service role (admin client) and bypass RLS.
drop policy if exists "authenticated read briefings" on public.briefings_notes;
create policy "authenticated read briefings"
  on public.briefings_notes for select to authenticated using (true);

drop policy if exists "authenticated update briefings" on public.briefings_notes;
create policy "authenticated update briefings"
  on public.briefings_notes for update to authenticated using (true) with check (true);
