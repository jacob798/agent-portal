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
