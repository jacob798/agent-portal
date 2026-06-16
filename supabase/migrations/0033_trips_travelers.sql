-- Trip travelers — the names on the trip. Sourced from the flights (the passenger memo on the
-- flight bookings) OR entered at manual trip setup (the upgrade: a trip with no flight, or to
-- override). Rendered in the trip header; never the QB vendor.
alter table public.trips
  add column if not exists travelers jsonb not null default '[]'::jsonb;
