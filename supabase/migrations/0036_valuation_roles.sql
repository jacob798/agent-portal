-- Valuation-scoped roles: add `underwriter` and `analyst` to the role vocabulary.
--
-- These let a user hold valuation "lock"/act rights WITHOUT being a portal admin
-- (admin sees every module + manages users; these roles do neither — their module
-- visibility is set by profile_modules, in practice just `valuation`). Role vocabulary
-- must match lib/auth/roles.ts. The valuation app maps underwriter/analyst 1:1 from the
-- SSO token (agents/valuation/core/portal_auth.py), so no valuation-side change.
--
-- The original checks (0002, 0035) were inline + unnamed -> Postgres auto-named them
-- <table>_role_check. Drop those and re-add named checks with the widened vocabulary.

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'operator', 'viewer', 'underwriter', 'analyst'));

alter table public.pending_invitations
  drop constraint if exists pending_invitations_role_check;
alter table public.pending_invitations
  add constraint pending_invitations_role_check
  check (role in ('admin', 'operator', 'viewer', 'underwriter', 'analyst'));
