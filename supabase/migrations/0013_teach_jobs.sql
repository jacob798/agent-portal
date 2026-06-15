-- 0013: teach-from-a-sample jobs.
-- The doc-type console uploads a sample to LEARN a type's fields (not to create a payable).
-- Those jobs are inserted with source='teach' + teach_doc_type, which the old CHECK
-- rejected ("Upload failed"). Allow the new source and ensure the teach columns exist.

alter table public.ingestion_jobs add column if not exists teach_doc_type text;
alter table public.doc_type_fields add column if not exists last_value text;

-- Widen the source check to include 'teach'.
alter table public.ingestion_jobs drop constraint if exists ingestion_jobs_source_check;
alter table public.ingestion_jobs
  add constraint ingestion_jobs_source_check
  check (source in ('upload', 'email', 'teach'));
