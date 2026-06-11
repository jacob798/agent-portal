-- The QBO memo, computed at ingest and stored on the row so the operator can SEE it
-- in the queue/drawer and EDIT it before posting. The post_runner uses this stored
-- value (operator override) and only computes one when it's blank.
alter table public.payables_queue add column if not exists memo text;
