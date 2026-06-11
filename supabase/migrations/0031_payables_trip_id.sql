-- Travel invoices post under the trip-header vendor and show in the Travel
-- module's per-trip running ledger. Link each travel-attributed payables row to
-- its trip so the portal can group by trip. Set at ingest by
-- agents/payables/core/ingest_processor._attribute_trip (date-window match).
alter table public.payables_queue add column if not exists trip_id text;
create index if not exists payables_queue_trip_id_idx on public.payables_queue (trip_id);
