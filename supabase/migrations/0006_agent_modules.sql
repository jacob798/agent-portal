-- Agent module read tables: Payables, Travel, Bookkeeper, BC Reimbursement.
--
-- These are the portal's read contract for the four agent modules added in
-- components/{payables,travel,bookkeeper,bc}. The agent-system backend is
-- expected to populate them (directly, or via views over its per-agent
-- schemas). Columns map to the TypeScript types in lib/data/{payables,travel,
-- bookkeeper,bc}.ts via the snake_case <-> camelCase mapping in those files.
-- Nested structures (lines, legs, itin, exps) are jsonb.
--
-- Idempotent: create-if-not-exists + seed on-conflict-do-nothing. Seed rows
-- mirror the mock data so the screens render real Supabase rows immediately;
-- the backend can upsert over them by id.

-- ---------------------------------------------------------------------------
-- Payables exception queue
-- ---------------------------------------------------------------------------
create table if not exists public.payables_queue (
  id          text primary key,
  vendor      text not null,
  sub         text,
  amount      numeric not null default 0,
  posting     text check (posting in ('bill','charge')),
  account     text,
  entity      text,
  recommended text,
  exception   text check (exception in ('entity','vendor','split','dup')),
  reason      text,
  category    text,
  lines       jsonb,
  gl          text,
  auto        boolean not null default false,
  nodoc       boolean not null default false,
  ord         integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id         text primary key,
  ent        text,
  dest       text,
  dates      text,
  status     text check (status in ('open','up','closed')),
  grace      text,
  purpose    text,
  total      numeric not null default 0,
  itin       jsonb not null default '[]',
  exps       jsonb not null default '[]',
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Travel expense-attribution queue
-- ---------------------------------------------------------------------------
create table if not exists public.travel_queue (
  id         text primary key,
  ic         text,
  merchant   text,
  sub        text,
  loc        text,
  home       boolean not null default false,
  category   text,
  amount     numeric not null default 0,
  trip       text,
  suggested  boolean not null default false,
  post_trip  boolean not null default false,
  gl         text,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookkeeper posting ledger (QBO API over OAuth)
-- ---------------------------------------------------------------------------
create table if not exists public.bookkeeper_ledger (
  id         text primary key,
  status     text check (status in ('posted','ready','err','held')),
  vendor     text,
  memo       text,
  type       text check (type in ('Purchase','Bill','Deposit','Check')),
  file       text,
  sub        text,
  amount     numeric not null default 0,
  ref        text,
  gap        boolean not null default false,
  legs       jsonb,
  balnote    text,
  err        text,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Builders Capital reimbursement workspace
-- ---------------------------------------------------------------------------
create table if not exists public.bc_reimbursement (
  id         text primary key,
  grp        text check (grp in ('travel','non')),
  ic         text,
  vendor     text,
  sub        text,
  gl         text,
  glsub      text,
  amount     numeric not null default 0,
  receipt    boolean not null default false,
  included   boolean not null default true,
  ord        integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: authenticated read; writes via service role only.
-- ---------------------------------------------------------------------------
alter table public.payables_queue   enable row level security;
alter table public.trips            enable row level security;
alter table public.travel_queue     enable row level security;
alter table public.bookkeeper_ledger enable row level security;
alter table public.bc_reimbursement enable row level security;

drop policy if exists "authenticated read payables_queue" on public.payables_queue;
create policy "authenticated read payables_queue" on public.payables_queue for select to authenticated using (true);

drop policy if exists "authenticated read trips" on public.trips;
create policy "authenticated read trips" on public.trips for select to authenticated using (true);

drop policy if exists "authenticated read travel_queue" on public.travel_queue;
create policy "authenticated read travel_queue" on public.travel_queue for select to authenticated using (true);

drop policy if exists "authenticated read bookkeeper_ledger" on public.bookkeeper_ledger;
create policy "authenticated read bookkeeper_ledger" on public.bookkeeper_ledger for select to authenticated using (true);

drop policy if exists "authenticated read bc_reimbursement" on public.bc_reimbursement;
create policy "authenticated read bc_reimbursement" on public.bc_reimbursement for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed (mirrors the mock data; backend upserts over these by id)
-- ---------------------------------------------------------------------------
insert into public.payables_queue (id,vendor,sub,amount,posting,account,entity,recommended,exception,reason,category,lines,gl,auto,nodoc,ord) values
 ('1','The Clean-Up Crew','Invoice 690 · Jun 8',540.00,'bill','unpaid · due Jun 20',null,'BC','entity','No entity detected from invoice content',null,'[{"desc":"Cleaning services","amount":540,"gl":"6300 Repairs & Maint"}]'::jsonb,null,false,false,1),
 ('2','Data Engine, LLC','billing@dataengine.io · Jun 9',616.97,'charge','AMEX WJW ••1004','BC','BC','vendor','Unrecognized sender — new vendor','Software / Data','[{"desc":"RealEstateAPI subscription","amount":616.97,"gl":"6200 Software"}]'::jsonb,null,false,false,2),
 ('10','Data Engine, LLC','billing@dataengine.io · May 9',616.97,'charge','AMEX WJW ••1004','BC','BC','vendor','Unrecognized sender — new vendor','Software / Data','[{"desc":"RealEstateAPI subscription","amount":616.97,"gl":"6200 Software"}]'::jsonb,null,false,false,3),
 ('3','Home Depot','Order #426182812 · Jun 7',287.43,'charge','AMEX WJW ••1004','WJW',null,'split','Split across line items — confirm coding',null,'[{"desc":"Lumber & framing","amount":180,"gl":"6120 Materials (WJW)"},{"desc":"Power tools","amount":107.43,"gl":"6140 Sm Tools (WJW)"}]'::jsonb,null,false,false,4),
 ('4','St Ignatius School','Automatic payment · Jun 6',425.00,'bill','Wells Fargo Checking','PER',null,'dup','Looks like a duplicate of a May 6 charge',null,'[{"desc":"Tuition autopay","amount":425,"gl":"7800 Personal"}]'::jsonb,null,false,false,5),
 ('9','Percy''s Restaurant','Jun 12 · Dining · 🚫 no trip on these dates',78.50,'charge','AMEX WJW ••1004',null,'PER','entity','A meal, but it''s not inside any trip window — so it''s a normal payable, not a trip expense',null,'[{"desc":"Dinner","amount":78.5,"gl":"7800 Meals (PER)"}]'::jsonb,null,false,true,6),
 ('5','Dropbox','Business plan renewal',96.00,'charge','AMEX Foundry ••1005','FC',null,null,null,null,null,'6200 Software',true,false,7),
 ('6','Quantum Fiber','Internet — June · from CSV',120.00,'charge','AMEX Foundry ••1005','FC',null,null,null,null,null,'6420 Internet',true,true,8),
 ('7','Apple','iCloud+ · from CSV',2.99,'charge','AMEX Delta ••5001','PER',null,null,null,null,null,'7800 Personal',true,true,9),
 ('8','Adobe','Creative Cloud',59.99,'charge','AMEX Foundry ••1005','FC',null,null,null,null,null,'6200 Software',true,false,10)
on conflict (id) do nothing;

insert into public.trips (id,ent,dest,dates,status,grace,purpose,total,itin,exps,ord) values
 ('den','BC','Denver, CO','Jun 4 – 7','open','grace thru Jul 7','Site visit — Iota St JV',1403.02,
  '[{"ic":"✈️","when":"Jun 4 · 9:10a","what":"Delta DL892 — BOI → DEN","sub":"Confirmation #DL77H2"},{"ic":"🏨","when":"Jun 4–6","what":"Westin Denver Downtown","sub":"2 nights · conf #W8821"},{"ic":"🚗","when":"Jun 4–7","what":"Hertz — midsize","sub":"DEN airport pickup"},{"ic":"📍","when":"Jun 5 · 2:00p","what":"Site meeting — Iota St JV","sub":"On calendar"},{"ic":"✈️","when":"Jun 7 · 6:40p","what":"Delta DL1180 — DEN → BOI","sub":"Confirmation #DL77H2"}]'::jsonb,
  '[{"ic":"✈️","what":"Delta Air Lines","sub":"Airfare · Jun 4","amount":410,"gl":"6730 Travel — Airfare"},{"ic":"🚕","what":"Uber","sub":"Rideshare · Jun 4","amount":28.5,"gl":"6720 Travel — Ground"},{"ic":"🏨","what":"Westin Denver","sub":"Lodging · Jun 5","amount":612,"gl":"6700 Travel — Lodging"},{"ic":"🍽️","what":"Chandlers Steakhouse","sub":"Dining · Jun 5","amount":84.2,"gl":"6710 Travel — Meals"},{"ic":"☕","what":"Dutch Bros","sub":"Dining · Jun 6","amount":9.15,"gl":"6710 Travel — Meals"},{"ic":"🚕","what":"Uber","sub":"Rideshare · Jun 6","amount":19.2,"gl":"6720 Travel — Ground"},{"ic":"🚗","what":"Hertz","sub":"Ground · invoiced Jun 21 (post-trip)","amount":240,"gl":"6720 Travel — Ground"}]'::jsonb,1),
 ('sea','FC','Seattle, WA','Jun 18 – 20','up',null,'Investor meetings',0,
  '[{"ic":"✈️","when":"Jun 18 · 7:25a","what":"Delta DL1234 — BOI → SEA","sub":"Confirmation pending"},{"ic":"🏨","when":"Jun 18–20","what":"Hotel — TBD","sub":"Not booked yet"}]'::jsonb,'[]'::jsonb,2),
 ('slc','BC','Salt Lake City, UT','May 28 – 30','closed',null,'Lender conference',2110.40,
  '[]'::jsonb,'[{"ic":"🏨","what":"Marriott SLC","sub":"Lodging","amount":1180,"gl":"6700"},{"ic":"✈️","what":"Delta","sub":"Airfare","amount":520,"gl":"6730"},{"ic":"🍽️","what":"Meals (5)","sub":"Dining","amount":410.4,"gl":"6710"}]'::jsonb,3),
 ('pdx','FC','Portland, OR','Apr 14 – 16','closed',null,'Property tour',1640.00,
  '[]'::jsonb,'[{"ic":"🏨","what":"Hotel","sub":"","amount":980,"gl":"6700"},{"ic":"✈️","what":"Air","sub":"","amount":660,"gl":"6730"}]'::jsonb,4),
 ('phx','BC','Phoenix, AZ','Mar 3 – 5','closed',null,'Builders Capital offsite',1925.00,'[]'::jsonb,'[]'::jsonb,5)
on conflict (id) do nothing;

insert into public.travel_queue (id,ic,merchant,sub,loc,home,category,amount,trip,suggested,post_trip,gl,ord) values
 ('e1','🏨','Westin Denver','AMEX WJW ••1004 · Jun 5 · Lodging','Denver, CO',false,'Lodging',612.00,'Builders Capital · Denver',true,false,'6700 Travel — Lodging',1),
 ('e2','🍽️','Chandlers Steakhouse','AMEX WJW ••1004 · Jun 5 · Dining','Denver, CO',false,'Dining',84.20,'Builders Capital · Denver',true,false,'6710 Travel — Meals',2),
 ('e3','🚗','Hertz','Invoiced Jun 21 · Jun 4–7 rental','Denver, CO',false,'Transport',240.00,'Builders Capital · Denver',true,true,'6720 Travel — Ground',3),
 ('e4','✈️','Delta Air Lines','AMEX Delta ••5001 · Jun 4 · Airfare','—',false,'Airfare',410.00,'Builders Capital · Denver',true,false,'6730 Travel — Airfare',4),
 ('e5','☕','Dutch Bros','AMEX WJW ••1004 · Jun 6 · Dining','Denver, CO',false,'Dining',9.15,'Builders Capital · Denver',true,false,'6710 Travel — Meals',5),
 ('eu1','🚕','Uber','AMEX WJW ••1004 · Jun 4 · Rideshare (DEN→hotel)','Denver, CO',false,'Transport',28.50,'Builders Capital · Denver',true,false,'6720 Travel — Ground',6),
 ('eu2','🚕','Uber','AMEX WJW ••1004 · Jun 6 · Rideshare (site visit)','Denver, CO',false,'Transport',19.20,'Builders Capital · Denver',true,false,'6720 Travel — Ground',7),
 ('e6','🍽️','Goldy''s Breakfast','AMEX WJW ••1004 · Jun 12 · Dining','Boise, ID',true,'Dining',31.40,null,false,false,'7800 Personal',8)
on conflict (id) do nothing;

insert into public.bookkeeper_ledger (id,status,vendor,memo,type,file,sub,amount,ref,gap,legs,balnote,err,ord) values
 ('1','posted','Travel 2026-06 — Builders Capital · Denver (6/4–6/7)','Delta Air Lines · airfare','Purchase','Jacob Wolbach (PER)','AMEX Delta ••5001',410.00,'QB Txn #1071',false,null,null,null,1),
 ('2','posted','Home Depot','Lumber & framing + power tools (split)','Purchase','WJW Investments Idaho','intercompany',287.43,'QB Txn #1072',false,'[{"file":"Jacob Wolbach (PER) — Purchase","act":"Cr AMEX ••1004 · Dr Loans Receivable — WJW","amount":287.43},{"file":"WJW Investments — Bill","act":"Dr 6120 Materials / 6140 Tools · Cr Expenses Payable — Jacob Wolbach","amount":287.43}]'::jsonb,null,null,2),
 ('3','posted','Quantum Fiber','Internet — June','Purchase','Foundry Capital LLC','AMEX Foundry ••1005',120.00,'QB Txn #1073',true,null,null,null,3),
 ('4','posted','Data Engine, LLC','RealEstateAPI subscription','Purchase','Jacob Wolbach (PER)','BC — balance sheet (Loan - Builders Capital)',616.97,'QB Txn #1074',false,null,null,null,4),
 ('5','posted','Paylocity reimbursement','BC expense reimbursement received','Deposit','Jacob Wolbach (PER)','clears Loan - Builders Capital',540.00,'QB Txn #1070',false,null,null,null,5),
 ('6','ready','St Ignatius School','Tuition autopay','Bill','Jacob Wolbach (PER)','auto-approved · staged for this cycle',425.00,'ready',false,null,null,null,6),
 ('8','ready','Adobe','Creative Cloud — monthly','Purchase','Foundry Capital LLC','auto-approved · known vendor',59.99,'ready',false,null,null,null,7),
 ('9','ready','Selkirk Management','Office supplies (intercompany)','Purchase','Selkirk Management LLC','auto-approved · intercompany',142.10,'ready',false,'[{"file":"Jacob Wolbach (PER) — Purchase","act":"Cr AMEX ••1004 · Dr Loans Receivable — Selkirk","amount":142.1},{"file":"Selkirk Management — Bill","act":"Dr 6900 Office / Admin · Cr Expenses Payable — Jacob Wolbach","amount":142.1}]'::jsonb,'Nets to $0 across the books — funded by Personal (PER), tracked as Loans Receivable until settled (50/50 partnership entity).',null,8),
 ('7','err','The Clean-Up Crew','Cleaning services · invoice 690','Bill','Builders Capital','vendor not found in QB file',540.00,'not posted',true,null,null,'Vendor “The Clean-Up Crew” does not exist in the Builders Capital QuickBooks file. Create the vendor or remap, then retry.',9)
on conflict (id) do nothing;

insert into public.bc_reimbursement (id,grp,ic,vendor,sub,gl,glsub,amount,receipt,included,ord) values
 ('den','travel','🧳','Denver site visit','Jun 4–7 · 7 receipts','Travel (Airfare/Lodging/Meals/Ground)','trip rollup',1403.02,true,true,1),
 ('de','non','💻','Data Engine, LLC','RealEstateAPI subscription · Jun 9','6200 Software','AMEX WJW ••1004',616.97,true,true,2),
 ('cc','non','🧹','The Clean-Up Crew','Office cleaning · invoice 690 · Jun 8','6300 Repairs & Maint','Bill',540.00,true,true,3),
 ('st','non','🖇️','Staples','Office supplies · Jun 5 · from CSV','6900 Office / Admin','AMEX WJW ••1004',86.40,false,true,4)
on conflict (id) do nothing;
