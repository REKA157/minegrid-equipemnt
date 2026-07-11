-- =====================================================================
-- PREREQ — verrouillage inspection_reports (P10). Reproduit l'état PROD (variante
-- transaction_platform) : policies d'écriture OUVERTES à tout participant. La
-- migration P10 doit fermer l'écriture cliente. Contre-cas = état verrouillé.
-- =====================================================================

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

-- Variante transaction_platform d'inspection_reports.
create table if not exists public.inspection_reports (
  id                    uuid primary key default gen_random_uuid(),
  transaction_case_id   uuid not null references public.transaction_cases (id) on delete cascade,
  mechanic_id           uuid,
  condition_score       int,
  summary               text,
  created_at            timestamptz not null default now()
);

-- ÉTAT PROD (AVANT correctif) : écriture OUVERTE à tout participant (mechanic OR can_access).
alter table public.inspection_reports enable row level security;
drop policy if exists inspection_reports_access on public.inspection_reports;
create policy inspection_reports_access on public.inspection_reports
  for select to authenticated
  using (mechanic_id = auth.uid() or public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists inspection_reports_write on public.inspection_reports;
create policy inspection_reports_write on public.inspection_reports
  for insert to authenticated
  with check (mechanic_id = auth.uid() or public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists inspection_reports_update on public.inspection_reports;
create policy inspection_reports_update on public.inspection_reports
  for update to authenticated
  using (mechanic_id = auth.uid() or public.can_access_transaction_case(transaction_case_id, auth.uid()));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.can_access_transaction_case(uuid, uuid) to authenticated, anon, service_role;
grant select, insert, update on public.inspection_reports to authenticated;

-- Semis : dossier C (vendeur A = SELLER), A a can_access ; M = mécanicien ; rapport R.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- A = vendeur (partie du dossier)
  ('00000000-0000-0000-0000-00000000000d'),  -- M = mécanicien
  ('00000000-0000-0000-0000-0000000000f1');  -- X = tiers
insert into public.transaction_cases (id, seller_user_id) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1');
insert into public.test_access (case_id, uid) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1');  -- A est partie du dossier
insert into public.inspection_reports (id, transaction_case_id, mechanic_id, condition_score, summary) values
  ('0e000000-0000-0000-0000-00000000000e', '0c000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-00000000000d', 60, 'RAS');
