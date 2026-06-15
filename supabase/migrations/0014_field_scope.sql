-- 0014: header/detail (scope) on the field spec.
-- A field belongs to a SCOPE: 'document' (header — appears once) or a repeating-group name
-- (segment, line_item, installment, draw_line — appears N times per document). This lets the
-- SAME flat spec table describe nested documents without any per-type tables: the nested data
-- still lands in documents.extracted (jsonb), the spec just tags which group each field is in.
-- field_key marks a group's primary/parent reference (parent = the document key copied into
-- each group instance; primary = the group's own identifier).

alter table public.doc_type_fields add column if not exists scope     text not null default 'document';
alter table public.doc_type_fields add column if not exists field_key text;   -- primary | parent | null

create index if not exists doc_type_fields_scope_idx on public.doc_type_fields (doc_type, scope);
