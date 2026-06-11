-- Operator-editable transaction (invoice/service) date → posted as the QB TxnDate.
-- Null falls back to the parsed expense date; an edit here overrides it.
alter table public.payables_queue add column if not exists txn_date text;
