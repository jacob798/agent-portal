SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';
-- Private, no-argument authorization lookup: returns only the caller's admin flag.
-- Dedicated schema is not added to the Data API's exposed schemas.
CREATE SCHEMA IF NOT EXISTS foundry_auth;
REVOKE ALL ON SCHEMA foundry_auth FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA foundry_auth TO authenticated;
CREATE OR REPLACE FUNCTION foundry_auth.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
); $$;
ALTER FUNCTION foundry_auth.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION foundry_auth.is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION foundry_auth.is_admin() TO authenticated;
-- Browser sessions are read-only. Guarded server routes retain service_role writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
DROP POLICY IF EXISTS "auth insert jobs" ON public.ingestion_jobs;
DROP POLICY IF EXISTS "authenticated can read profiles" ON public.profiles;
CREATE POLICY "foundry_profile_read" ON public.profiles FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT foundry_auth.is_admin()));
DROP POLICY IF EXISTS "authenticated can read agent_health" ON public.agent_health;
CREATE POLICY foundry_module_read ON public.agent_health FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['monitoring']::text[])));
DROP POLICY IF EXISTS "bc_cat_read" ON public.bc_categories;
CREATE POLICY foundry_module_read ON public.bc_categories FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['payables']::text[])));
DROP POLICY IF EXISTS "auth read bcreimb" ON public.bc_reimbursement;
CREATE POLICY foundry_module_read ON public.bc_reimbursement FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['bc-reimbursement','bookkeeper']::text[])));
DROP POLICY IF EXISTS "auth read ledger" ON public.bookkeeper_ledger;
CREATE POLICY foundry_module_read ON public.bookkeeper_ledger FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['bookkeeper']::text[])));
DROP POLICY IF EXISTS "config_blobs_read" ON public.config_blobs;
CREATE POLICY foundry_module_read ON public.config_blobs FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['rules']::text[])));
DROP POLICY IF EXISTS "gl_read" ON public.gl_accounts;
CREATE POLICY foundry_module_read ON public.gl_accounts FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['payables']::text[])));
DROP POLICY IF EXISTS "auth read jobs" ON public.ingestion_jobs;
CREATE POLICY foundry_module_read ON public.ingestion_jobs FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['inbox','ingest-exceptions']::text[])));
DROP POLICY IF EXISTS "authenticated can read operator_actions" ON public.operator_actions;
CREATE POLICY foundry_module_read ON public.operator_actions FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['inbox']::text[])));
DROP POLICY IF EXISTS "auth read payables" ON public.payables_queue;
CREATE POLICY foundry_module_read ON public.payables_queue FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['payables','expense-reports','bookkeeper','inbox']::text[])) OR (trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = 'travel')));
DROP POLICY IF EXISTS "pm_read" ON public.payment_methods;
CREATE POLICY foundry_module_read ON public.payment_methods FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['payables']::text[])));
DROP POLICY IF EXISTS "authenticated can read review_queue" ON public.review_queue;
CREATE POLICY foundry_module_read ON public.review_queue FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['review-queue']::text[])));
DROP POLICY IF EXISTS "auth read travelq" ON public.travel_queue;
CREATE POLICY foundry_module_read ON public.travel_queue FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['travel']::text[])));
DROP POLICY IF EXISTS "auth read trips" ON public.trips;
CREATE POLICY foundry_module_read ON public.trips FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['travel','expense-reports','ingest-exceptions']::text[])));
DROP POLICY IF EXISTS "vr_read" ON public.vendor_rules;
CREATE POLICY foundry_module_read ON public.vendor_rules FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['rules','payables']::text[])));
DROP POLICY IF EXISTS "vendors_read" ON public.vendors;
CREATE POLICY foundry_module_read ON public.vendors FOR SELECT TO authenticated USING ((SELECT foundry_auth.is_admin()) OR EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id = (SELECT auth.uid()) AND m.module_key = ANY(ARRAY['payables','rules']::text[])));
ALTER FUNCTION public.block_seed_on_curated_fields() SET search_path = '';
-- Trigger invocation does not require browser EXECUTE permission.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Atomic, aggregate-only assertions. No customer rows or IDs are emitted.
DO $checks$
DECLARE
 admin_id uuid; restricted_id uuid; t text; n bigint; expected jsonb := '{}'::jsonb;
 actual bigint; module text; pair record;
BEGIN
 SELECT id INTO STRICT admin_id FROM public.profiles WHERE role='admin' LIMIT 1;
 SELECT p.id INTO STRICT restricted_id FROM public.profiles p WHERE p.role <> 'admin'
 AND NOT EXISTS (SELECT 1 FROM public.profile_modules m WHERE m.profile_id=p.id AND m.module_key <> 'valuation') LIMIT 1;
 FOREACH t IN ARRAY ARRAY['agent_health','bc_categories','bc_reimbursement','bookkeeper_ledger','config_blobs','gl_accounts','ingestion_jobs','operator_actions','payables_queue','payment_methods','review_queue','travel_queue','trips','vendor_rules','vendors','profiles'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  expected := expected || jsonb_build_object(t,n);
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF NOT foundry_auth.is_admin() THEN RAISE EXCEPTION 'Admin lookup failed'; END IF;
 FOREACH t IN ARRAY ARRAY['agent_health','bc_categories','bc_reimbursement','bookkeeper_ledger','config_blobs','gl_accounts','ingestion_jobs','operator_actions','payables_queue','payment_methods','review_queue','travel_queue','trips','vendor_rules','vendors','profiles'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
  IF actual <> (expected->>t)::bigint THEN RAISE EXCEPTION 'Admin read failed: %',t; END IF;
 END LOOP;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',restricted_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',restricted_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 IF foundry_auth.is_admin() THEN RAISE EXCEPTION 'Restricted user is admin'; END IF;
 FOREACH t IN ARRAY ARRAY['agent_health','bc_categories','bc_reimbursement','bookkeeper_ledger','config_blobs','gl_accounts','ingestion_jobs','operator_actions','payables_queue','payment_methods','review_queue','travel_queue','trips','vendor_rules','vendors','profiles'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO actual;
  IF (t='profiles' AND actual<>1) OR (t<>'profiles' AND actual<>0) THEN RAISE EXCEPTION 'Ungrant read exposed: %',t; END IF;
 END LOOP;
 RESET ROLE;
 -- Each temporary grant is rolled back inside its own subtransaction.
 FOR pair IN SELECT key AS tab, value AS mods FROM jsonb_each('{"agent_health": ["monitoring"], "bc_categories": ["payables"], "bc_reimbursement": ["bc-reimbursement", "bookkeeper"], "bookkeeper_ledger": ["bookkeeper"], "config_blobs": ["rules"], "gl_accounts": ["payables"], "ingestion_jobs": ["inbox", "ingest-exceptions"], "operator_actions": ["inbox"], "payables_queue": ["payables", "expense-reports", "bookkeeper", "inbox"], "payment_methods": ["payables"], "review_queue": ["review-queue"], "travel_queue": ["travel"], "trips": ["travel", "expense-reports", "ingest-exceptions"], "vendor_rules": ["rules", "payables"], "vendors": ["payables", "rules"]}'::jsonb) LOOP
  FOR module IN SELECT jsonb_array_elements_text(pair.mods) LOOP
   BEGIN
    INSERT INTO public.profile_modules(profile_id,module_key) VALUES(restricted_id,module);
    SET LOCAL ROLE authenticated;
    EXECUTE format('SELECT count(*) FROM public.%I',pair.tab) INTO actual;
    IF actual <> (expected->>pair.tab)::bigint THEN RAISE EXCEPTION 'Granted module read failed: % / %',pair.tab,module; END IF;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback test grant';
   EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
   END;
  END LOOP;
 END LOOP;
 -- The narrow Travel-to-payables handoff must expose only rows linked to a trip.
 BEGIN
  INSERT INTO public.profile_modules(profile_id,module_key) VALUES(restricted_id,'travel');
  SELECT count(*) INTO n FROM public.payables_queue WHERE trip_id IS NOT NULL;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO actual FROM public.payables_queue;
  IF n<>actual THEN RAISE EXCEPTION 'Travel payable scope failed'; END IF;
  RESET ROLE;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback test grant';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated' AND privilege_type<>'SELECT') THEN RAISE EXCEPTION 'Browser write grant remains'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') THEN RAISE EXCEPTION 'Anonymous grant remains'; END IF;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  IF NOT has_table_privilege('service_role',format('public.%I',t),'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Worker grant missing: %',t; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
END;
$checks$;
