-- Agent Portal user profiles + roles.
--
-- One row per Supabase auth user, carrying their portal role. A trigger
-- creates a 'viewer' profile automatically on first sign-in. Apply after
-- 0001_portal.sql. Role vocabulary matches lib/auth/roles.ts.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text,
  role          text not null default 'viewer'
                  check (role in ('admin', 'operator', 'viewer')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user appears (first SSO sign-in).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: any authenticated user can read profiles (needed for the admin list
-- and to read their own role). Role *writes* are not allowed through the
-- anon/authenticated key — the admin UI updates roles via a server action
-- using the service-role key, gated in app code by the manage_users capability.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "authenticated can read profiles"
  on public.profiles for select
  to authenticated using (true);
