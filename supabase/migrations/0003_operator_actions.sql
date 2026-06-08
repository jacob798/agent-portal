-- Operator-action loop — the contract that replaces Teams interactions.
--
-- Any agent writes a typed action it needs an operator to handle; the portal
-- renders it and writes the decision back. Agents consume resolved rows to act.
-- This generalizes the four Teams Adaptive Card interaction types.

create table if not exists public.operator_actions (
  id           text primary key,
  agent        text not null,
  agent_label  text not null,
  -- approval (✅/❌) | choice (pick one) | input (free text) | alert (acknowledge)
  type         text not null check (type in ('approval','choice','input','alert')),
  title        text not null,
  body         text,
  -- for type='choice': [{"value":"fc","label":"Foundry Capital"}, ...]
  options      jsonb,
  priority     text not null default 'medium' check (priority in ('high','medium','low')),
  entity       text,
  amount       numeric,
  -- source references so the agent can correlate the decision (trip_id, invoice_id, …)
  context      jsonb,
  status       text not null default 'pending'
                 check (status in ('pending','resolved','dismissed')),
  -- the operator's answer: {"action":"approved"} | {"choice":"fc"} | {"input":"…"}
  decision     jsonb,
  decided_by   uuid references auth.users (id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists operator_actions_status_idx
  on public.operator_actions (status, created_at desc);
create index if not exists operator_actions_agent_idx
  on public.operator_actions (agent);

alter table public.operator_actions enable row level security;

create policy "authenticated can read operator_actions"
  on public.operator_actions for select
  to authenticated using (true);
