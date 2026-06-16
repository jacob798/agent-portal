-- Per-leg confirmation REVIEW items the Travel page renders (group co-travelers, Split per traveler,
-- four actions). The worker writes this from the trip's flight/train bookings; the portal reads it.
-- Shape: [{ key, day, route, flights, depart, pnr_count, confs:[{booking_id, conf, traveler,
--           source_url, status, vendor}] }]
alter table public.trips
  add column if not exists confirmations jsonb not null default '[]'::jsonb;
