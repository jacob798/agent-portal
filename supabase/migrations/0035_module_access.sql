-- Per-user agent-module access control + user provisioning.
--
-- Model: a user's ROLE (profiles.role) still sets the capability baseline
-- (read/act/create/lock/manage_users). A per-user GRANT in profile_modules
-- decides WHICH agent modules are visible/usable. Admins + PORTAL_OWNER_EMAILS
-- get every module implicitly (enforced in app code, see lib/auth/modules.ts).
--
-- Module keys are owned by lib/auth/modules.ts (the canonical registry). The
-- non-admin keys at the time of this migration are listed in the backfill below.
-- Apply after 0034_trips_confirmations.sql.

-- ---------------------------------------------------------------------------
-- 1. profile_modules — the per-user grant set.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_modules (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  module_key  text not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (profile_id, module_key)
);

create index if not exists profile_modules_profile_idx
  on public.profile_modules (profile_id);

alter table public.profile_modules enable row level security;

-- A user may read THEIR OWN grants (middleware + page/api guards). The admin
-- list view reads all grants via the service-role key (bypasses RLS). Writes
-- happen only through the service role, gated in app code by manage_users.
drop policy if exists "read own module grants" on public.profile_modules;
create policy "read own module grants"
  on public.profile_modules for select
  to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. pending_invitations — provision a user before their first SSO sign-in.
--    profiles.id is FK to auth.users(id), so we cannot pre-seed a profile row.
--    We stage the role + modules by email here; the new-user trigger applies
--    them on first sign-in, then deletes the invite.
-- ---------------------------------------------------------------------------
create table if not exists public.pending_invitations (
  email       text primary key,
  role        text not null default 'viewer'
                check (role in ('admin', 'operator', 'viewer')),
  modules     text[] not null default '{}',
  invited_by  uuid references public.profiles (id) on delete set null,
  invited_at  timestamptz not null default now()
);

alter table public.pending_invitations enable row level security;
-- No authenticated policies: only the service role (admin UI) reads/writes.

-- ---------------------------------------------------------------------------
-- 3. access_audit — who changed whose role/modules.
-- ---------------------------------------------------------------------------
create table if not exists public.access_audit (
  id                 bigserial primary key,
  actor_id           uuid,
  actor_email        text,
  action             text not null,            -- 'set_role' | 'set_modules' | 'invite' | 'revoke_invite'
  target_profile_id  uuid,
  target_email       text,
  detail             jsonb not null default '{}',
  at                 timestamptz not null default now()
);

alter table public.access_audit enable row level security;
-- No authenticated policies: service role only.

-- ---------------------------------------------------------------------------
-- 4. New-user trigger: apply a pending invite (role + module grants), else the
--    default 'viewer' with NO module grants (deny-by-default; the user sees
--    only the always-on Dashboard until an admin grants modules).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.pending_invitations%rowtype;
begin
  select * into inv from public.pending_invitations
   where lower(email) = lower(new.email);

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    coalesce(inv.role, 'viewer')
  )
  on conflict (id) do nothing;

  if found then
    insert into public.profile_modules (profile_id, module_key, granted_by)
    select new.id, m, inv.invited_by
      from unnest(inv.modules) as m
    on conflict do nothing;

    delete from public.pending_invitations where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Backfill: preserve current behavior. Today every signed-in user sees every
--    module, so grant every EXISTING profile the full non-admin module set.
--    (Dashboard is always-on; Admin is governed by manage_users — neither is a
--    grant row.) New users after this migration are deny-by-default.
-- ---------------------------------------------------------------------------
insert into public.profile_modules (profile_id, module_key)
select p.id, k.module_key
  from public.profiles p
  cross join (values
    ('inbox'), ('ingest-exceptions'), ('review-queue'), ('monitoring'),
    ('payables'), ('expense-reports'), ('travel'), ('bookkeeper'),
    ('valuation'), ('bc-reimbursement'), ('briefings'), ('rules')
  ) as k(module_key)
on conflict do nothing;
