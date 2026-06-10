-- Allow authenticated portal users to upload documents directly to the
-- 'documents' bucket (client-side upload from the browser session). The backend
-- processor reads/writes under the service role.
drop policy if exists "authenticated upload documents" on storage.objects;
create policy "authenticated upload documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents');
