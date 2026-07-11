-- PREREQ — restriction UPDATE transaction_cases (migration 20260702090400).
-- Reproduit l'état PROD (baseline core.sql) : UPDATE ouvert à tout participant.

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

create table if not exists public.organizations (id uuid primary key, name text);
create table if not exists public.organization_members (
  organization_id uuid, user_id uuid, role text, primary key (organization_id, user_id)
);
create or replace function public.user_in_org_admin(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = p_uid and m.role in ('owner','admin'));
$fn$;

create table if not exists public.transaction_cases (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid, buyer_user_id uuid, organization_id uuid,
  title text, notes text, priority text,
  total_amount numeric(18,2), status text default 'open', machine_id uuid
);
create table if not exists public.test_access (case_id uuid, uid uuid);
create or replace function public.can_access_transaction_case(p_case uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.test_access a where a.case_id = p_case and a.uid = p_uid);
$fn$;

-- ÉTAT PROD (AVANT correctif) : UPDATE ouvert à tout participant + grant complet.
alter table public.transaction_cases enable row level security;
drop policy if exists transaction_cases_select on public.transaction_cases;
create policy transaction_cases_select on public.transaction_cases
  for select to authenticated using (public.can_access_transaction_case(id, auth.uid()));
drop policy if exists transaction_cases_update on public.transaction_cases;
create policy transaction_cases_update on public.transaction_cases
  for update to authenticated using (public.can_access_transaction_case(id, auth.uid()));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.user_in_org_admin(uuid,uuid), public.can_access_transaction_case(uuid,uuid) to authenticated, anon, service_role;
grant select, insert, update on public.transaction_cases to authenticated;

-- Semis : org O, dossier C (vendeur A, acheteur B, org O), transporteur T (participant non principal).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- A vendeur
  ('00000000-0000-0000-0000-0000000000b1'),  -- B acheteur
  ('00000000-0000-0000-0000-0000000000c1');  -- T transporteur (participant)
insert into public.organizations (id, name) values ('0e000000-0000-0000-0000-0000000000e1', 'Org O');
insert into public.transaction_cases (id, seller_user_id, buyer_user_id, organization_id, title, total_amount, status)
  values ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000b1', '0e000000-0000-0000-0000-0000000000e1', 'Dossier initial', 100000, 'open');
insert into public.test_access (case_id, uid) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1'),
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1'),
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1');
