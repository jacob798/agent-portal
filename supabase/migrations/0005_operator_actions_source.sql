-- Source document for a review action: the invoice PDF / email the operator
-- needs to see to answer. source_url should be directly viewable (e.g. a
-- Dropbox raw link) so the portal can embed it; source_label is the display name.

alter table public.operator_actions
  add column if not exists source_url text,
  add column if not exists source_label text;
