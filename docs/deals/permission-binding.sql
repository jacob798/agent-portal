-- DRAFT authorization-owner binding. No grants or default identities are seeded.
-- Reserve a shared-services migration number and reviewed runner steps before use.
CREATE TABLE public.portal_deals_capability_grants (
 account_id uuid NOT NULL,project_id uuid,actor_id uuid NOT NULL REFERENCES auth.users(id),
 capability text NOT NULL CHECK(capability IN ('view','edit','review','create_project','maintain_reference')),
 active boolean NOT NULL,valid_from timestamptz,valid_to timestamptz,
 CHECK((capability IN ('create_project','maintain_reference'))=(project_id IS NULL)),
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_to>valid_from),
 UNIQUE NULLS NOT DISTINCT(account_id,project_id,actor_id,capability)
);
ALTER TABLE public.portal_deals_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_deals_capability_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY self_read ON public.portal_deals_capability_grants FOR SELECT TO authenticated
 USING(actor_id=auth.uid());
REVOKE ALL ON public.portal_deals_capability_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.portal_deals_capability_grants TO authenticated;
CREATE VIEW public.portal_deals_capabilities WITH(security_invoker=true) AS
 SELECT account_id,project_id,actor_id,capability,active,valid_from,valid_to FROM public.portal_deals_capability_grants;
REVOKE ALL ON public.portal_deals_capabilities FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.portal_deals_capabilities TO authenticated;
-- The reviewed migration must grant the dedicated processor SELECT and a matching
-- SELECT-only policy. It must not grant INSERT/UPDATE/DELETE or inherit an auth role.
-- Grant administration remains the authorization owner's privileged audited process.
