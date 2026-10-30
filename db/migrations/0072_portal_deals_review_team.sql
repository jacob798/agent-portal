-- Initial review-project grants for the approved five-person team; not installed.
-- This does not implement grants for later projects. No reference administration.
-- Approved access scope only; run in the reviewed deployment step, not directly.
-- Jacob 2026-10-29: "yes" to create at review account, view/edit/review on review projects.
-- New generated deployment IDs, not runtime defaults. No maintain_reference grant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='3601b779-ef26-4f09-8b4f-fcee9738caab') THEN
  RAISE EXCEPTION 'review_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND project_id<>'fce8495f-a454-4e87-b801-4c7aa2a9601e') THEN
  RAISE EXCEPTION 'review_account_contains_unlisted_project'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND account_id<>'e5157228-2645-4ce4-bc66-2e5b6cb5e6a7') THEN
  RAISE EXCEPTION 'review_project_scope_collision'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_deals_capability_grants WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND actor_id='3601b779-ef26-4f09-8b4f-fcee9738caab' AND
   ((project_id IS NULL AND capability='create_project') OR (project_id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND capability IN ('view','edit','review')))
   AND (NOT active OR valid_from IS NOT NULL OR valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION 'existing_grant_state_requires_review'; END IF;
END $$;
INSERT INTO public.portal_deals_capability_grants(account_id,project_id,actor_id,capability,active,valid_from,valid_to) VALUES
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7',NULL,'3601b779-ef26-4f09-8b4f-fcee9738caab','create_project',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3601b779-ef26-4f09-8b4f-fcee9738caab','view',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3601b779-ef26-4f09-8b4f-fcee9738caab','edit',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3601b779-ef26-4f09-8b4f-fcee9738caab','review',true,NULL,NULL)
ON CONFLICT(account_id,project_id,actor_id,capability) DO NOTHING;

-- Approved access scope only; run in the reviewed deployment step, not directly.
-- Jacob 2026-10-29: "yes" to create at review account, view/edit/review on review projects.
-- New generated deployment IDs, not runtime defaults. No maintain_reference grant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='e81cf430-6d3b-484f-9e1f-a91cb3db22eb') THEN
  RAISE EXCEPTION 'review_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND project_id<>'fce8495f-a454-4e87-b801-4c7aa2a9601e') THEN
  RAISE EXCEPTION 'review_account_contains_unlisted_project'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND account_id<>'e5157228-2645-4ce4-bc66-2e5b6cb5e6a7') THEN
  RAISE EXCEPTION 'review_project_scope_collision'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_deals_capability_grants WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND actor_id='e81cf430-6d3b-484f-9e1f-a91cb3db22eb' AND
   ((project_id IS NULL AND capability='create_project') OR (project_id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND capability IN ('view','edit','review')))
   AND (NOT active OR valid_from IS NOT NULL OR valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION 'existing_grant_state_requires_review'; END IF;
END $$;
INSERT INTO public.portal_deals_capability_grants(account_id,project_id,actor_id,capability,active,valid_from,valid_to) VALUES
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7',NULL,'e81cf430-6d3b-484f-9e1f-a91cb3db22eb','create_project',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','e81cf430-6d3b-484f-9e1f-a91cb3db22eb','view',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','e81cf430-6d3b-484f-9e1f-a91cb3db22eb','edit',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','e81cf430-6d3b-484f-9e1f-a91cb3db22eb','review',true,NULL,NULL)
ON CONFLICT(account_id,project_id,actor_id,capability) DO NOTHING;

-- Approved access scope only; run in the reviewed deployment step, not directly.
-- Jacob 2026-10-29: "yes" to create at review account, view/edit/review on review projects.
-- New generated deployment IDs, not runtime defaults. No maintain_reference grant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c') THEN
  RAISE EXCEPTION 'review_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND project_id<>'fce8495f-a454-4e87-b801-4c7aa2a9601e') THEN
  RAISE EXCEPTION 'review_account_contains_unlisted_project'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND account_id<>'e5157228-2645-4ce4-bc66-2e5b6cb5e6a7') THEN
  RAISE EXCEPTION 'review_project_scope_collision'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_deals_capability_grants WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND actor_id='691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c' AND
   ((project_id IS NULL AND capability='create_project') OR (project_id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND capability IN ('view','edit','review')))
   AND (NOT active OR valid_from IS NOT NULL OR valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION 'existing_grant_state_requires_review'; END IF;
END $$;
INSERT INTO public.portal_deals_capability_grants(account_id,project_id,actor_id,capability,active,valid_from,valid_to) VALUES
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7',NULL,'691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c','create_project',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c','view',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c','edit',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','691d0a9b-4c2c-4227-b5ac-96d4a7f01e0c','review',true,NULL,NULL)
ON CONFLICT(account_id,project_id,actor_id,capability) DO NOTHING;

-- Approved access scope only; run in the reviewed deployment step, not directly.
-- Jacob 2026-10-29: "yes" to create at review account, view/edit/review on review projects.
-- New generated deployment IDs, not runtime defaults. No maintain_reference grant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='3adc9b8c-0235-4081-aebc-e01913b53718') THEN
  RAISE EXCEPTION 'review_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND project_id<>'fce8495f-a454-4e87-b801-4c7aa2a9601e') THEN
  RAISE EXCEPTION 'review_account_contains_unlisted_project'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND account_id<>'e5157228-2645-4ce4-bc66-2e5b6cb5e6a7') THEN
  RAISE EXCEPTION 'review_project_scope_collision'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_deals_capability_grants WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND actor_id='3adc9b8c-0235-4081-aebc-e01913b53718' AND
   ((project_id IS NULL AND capability='create_project') OR (project_id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND capability IN ('view','edit','review')))
   AND (NOT active OR valid_from IS NOT NULL OR valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION 'existing_grant_state_requires_review'; END IF;
END $$;
INSERT INTO public.portal_deals_capability_grants(account_id,project_id,actor_id,capability,active,valid_from,valid_to) VALUES
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7',NULL,'3adc9b8c-0235-4081-aebc-e01913b53718','create_project',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3adc9b8c-0235-4081-aebc-e01913b53718','view',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3adc9b8c-0235-4081-aebc-e01913b53718','edit',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','3adc9b8c-0235-4081-aebc-e01913b53718','review',true,NULL,NULL)
ON CONFLICT(account_id,project_id,actor_id,capability) DO NOTHING;

-- Approved access scope only; run in the reviewed deployment step, not directly.
-- Jacob 2026-10-29: "yes" to create at review account, view/edit/review on review projects.
-- New generated deployment IDs, not runtime defaults. No maintain_reference grant.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='8fcbb6d2-7b89-4973-8a68-08d77123e658') THEN
  RAISE EXCEPTION 'review_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND project_id<>'fce8495f-a454-4e87-b801-4c7aa2a9601e') THEN
  RAISE EXCEPTION 'review_account_contains_unlisted_project'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_records WHERE id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND account_id<>'e5157228-2645-4ce4-bc66-2e5b6cb5e6a7') THEN
  RAISE EXCEPTION 'review_project_scope_collision'; END IF;
 IF EXISTS(SELECT 1 FROM public.portal_deals_capability_grants WHERE account_id='e5157228-2645-4ce4-bc66-2e5b6cb5e6a7' AND actor_id='8fcbb6d2-7b89-4973-8a68-08d77123e658' AND
   ((project_id IS NULL AND capability='create_project') OR (project_id='fce8495f-a454-4e87-b801-4c7aa2a9601e' AND capability IN ('view','edit','review')))
   AND (NOT active OR valid_from IS NOT NULL OR valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION 'existing_grant_state_requires_review'; END IF;
END $$;
INSERT INTO public.portal_deals_capability_grants(account_id,project_id,actor_id,capability,active,valid_from,valid_to) VALUES
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7',NULL,'8fcbb6d2-7b89-4973-8a68-08d77123e658','create_project',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','8fcbb6d2-7b89-4973-8a68-08d77123e658','view',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','8fcbb6d2-7b89-4973-8a68-08d77123e658','edit',true,NULL,NULL),
 ('e5157228-2645-4ce4-bc66-2e5b6cb5e6a7','fce8495f-a454-4e87-b801-4c7aa2a9601e','8fcbb6d2-7b89-4973-8a68-08d77123e658','review',true,NULL,NULL)
ON CONFLICT(account_id,project_id,actor_id,capability) DO NOTHING;

