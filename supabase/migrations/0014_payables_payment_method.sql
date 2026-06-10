-- The resolved payment method (card/bank) for a payables row. The parser
-- resolves payment_method_id from the card last-4 on the invoice; storing it
-- lets the drawer default the Pay-from to the right account instead of the
-- first one in the list.
alter table public.payables_queue add column if not exists payment_method_id text;
