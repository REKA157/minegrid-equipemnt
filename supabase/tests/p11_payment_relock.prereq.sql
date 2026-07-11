-- PREREQ — re-verrouillage payment_records (P11). Reproduit l'état PROD constaté :
-- écriture cliente OUVERTE (grant + policies write). La migration doit la fermer.

do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('test.uid', true), '')::uuid
$fn$;

create table if not exists public.transaction_cases (id uuid primary key, seller_user_id uuid);
create table if not exists public.test_access (case_id uuid, uid uuid);
create or replace function public.can_access_transaction_case(p_case uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.test_access a where a.case_id = p_case and a.uid = p_uid);
$fn$;

create table if not exists public.payment_records (
  id                  uuid primary key default gen_random_uuid(),
  transaction_case_id uuid not null references public.transaction_cases (id) on delete cascade,
  payer_id            uuid,
  payee_id            uuid,
  amount              numeric(18,2),
  status              text not null default 'pending',
  created_at          timestamptz not null default now()
);

-- ÉTAT PROD (baseline extended.sql) : écriture OUVERTE à tout participant.
alter table public.payment_records enable row level security;
drop policy if exists payment_records_access on public.payment_records;
create policy payment_records_access on public.payment_records
  for select to authenticated
  using (payer_id = auth.uid() or payee_id = auth.uid()
         or public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists payment_records_write on public.payment_records;
create policy payment_records_write on public.payment_records
  for insert to authenticated
  with check (public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists payment_records_update on public.payment_records;
create policy payment_records_update on public.payment_records
  for update to authenticated
  using (public.can_access_transaction_case(transaction_case_id, auth.uid()));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.can_access_transaction_case(uuid, uuid) to authenticated, anon, service_role;
grant select, insert, update on public.payment_records to authenticated;

-- Semis : dossier C (vendeur A), B participant, paiement PR 'pending'.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.transaction_cases (id, seller_user_id) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1');
insert into public.test_access (case_id, uid) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1'),
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1');
insert into public.payment_records (id, transaction_case_id, payer_id, payee_id, amount, status) values
  ('0e000000-0000-0000-0000-00000000000e', '0c000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 100000, 'pending');
