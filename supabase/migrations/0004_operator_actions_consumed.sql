-- Let agents mark a resolved action as consumed (applied back in the agent),
-- so the response poller is idempotent and never double-processes a decision.

alter table public.operator_actions
  add column if not exists consumed_at timestamptz;

create index if not exists operator_actions_unconsumed_idx
  on public.operator_actions (status, consumed_at);
