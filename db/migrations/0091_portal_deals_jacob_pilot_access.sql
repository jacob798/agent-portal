-- Reserved0091 after43-ref inventory through0090. Explicit Jacob-only pilot scope.
-- Prospective test-project UUID is fixed in the release manifest and create-form URL.
-- No other user, future project, reference stewardship or existing grant is changed.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='3601b779-ef26-4f09-8b4f-fcee9738caab') THEN RAISE EXCEPTION 'pilot_subject_missing'; END IF;
 IF EXISTS(SELECT 1 FROM portal_deals_capability_grants WHERE account_id='d7b6ed83-b156-46d7-85ab-c6b718dd39a1') THEN RAISE EXCEPTION 'pilot_grants_exist_requires_review'; END IF;
 IF EXISTS(SELECT 1 FROM project_records WHERE id='ebdf909a-136c-46c8-95dd-f7a77532f786') THEN RAISE EXCEPTION 'pilot_test_project_id_already_exists'; END IF;
END $$;
INSERT INTO portal_deals_capability_grants(account_id,project_id,actor_id,capability,active) VALUES
('d7b6ed83-b156-46d7-85ab-c6b718dd39a1'::uuid,NULL,'3601b779-ef26-4f09-8b4f-fcee9738caab'::uuid,'create_project',true),
('d7b6ed83-b156-46d7-85ab-c6b718dd39a1'::uuid,'ebdf909a-136c-46c8-95dd-f7a77532f786'::uuid,'3601b779-ef26-4f09-8b4f-fcee9738caab'::uuid,'view',true),
('d7b6ed83-b156-46d7-85ab-c6b718dd39a1'::uuid,'ebdf909a-136c-46c8-95dd-f7a77532f786'::uuid,'3601b779-ef26-4f09-8b4f-fcee9738caab'::uuid,'edit',true),
('d7b6ed83-b156-46d7-85ab-c6b718dd39a1'::uuid,'ebdf909a-136c-46c8-95dd-f7a77532f786'::uuid,'3601b779-ef26-4f09-8b4f-fcee9738caab'::uuid,'review',true);
