-- =====================================================================
-- PREREQ pour prouver le verrouillage de commission_records (P8) sur base jetable.
-- Reproduit l'ÉTAT BASELINE (extended.sql) : commission_records avec policies
-- d'écriture OUVERTES + GRANT INSERT/UPDATE. La migration P8 (concaténée ensuite)
-- doit FERMER ces écritures. Les contre-cas prouvent l'état verrouillé.
--
-- EXÉCUTION :
--   cat supabase/tests/p8_commission_lock.prereq.sql \
--       supabase/migrations/20260711170000_p8_lock_commission_records.sql \
--       supabase/tests/p8_commission_lock.countercases.sql \
--     | docker exec -i pg psql -U postgres -d test -v ON_ERROR_STOP=1
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

-- Dossier + stub d'accès (can_access_transaction_case = membre du dossier).
create table if not exists public.transaction_cases (id uuid primary key, seller_user_id uuid);
create table if not exists public.test_access (case_id uuid, uid uuid);
create or replace function public.can_access_transaction_case(p_case uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.test_access a where a.case_id = p_case and a.uid = p_uid);
$fn$;

-- Table monétaire (colonnes = baseline extended.sql).
create table if not exists public.commission_records (
  id                  uuid primary key default gen_random_uuid(),
  transaction_case_id uuid not null references public.transaction_cases (id) on delete cascade,
  beneficiary_id      uuid,
  role                text not null default 'broker',
  commission_type     text default 'broker',
  amount              numeric(18,2),
  currency            text default 'MAD',
  status              text not null default 'pending',
  created_at          timestamptz not null default now()
);

-- ÉTAT BASELINE (AVANT correctif) : écritures OUVERTES à tout participant.
alter table public.commission_records enable row level security;
drop policy if exists commission_records_access on public.commission_records;
create policy commission_records_access on public.commission_records
  for select to authenticated
  using (beneficiary_id = auth.uid() or public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists commission_records_write on public.commission_records;
create policy commission_records_write on public.commission_records
  for insert to authenticated
  with check (public.can_access_transaction_case(transaction_case_id, auth.uid()));
drop policy if exists commission_records_update on public.commission_records;
create policy commission_records_update on public.commission_records
  for update to authenticated
  using (beneficiary_id = auth.uid() or public.can_access_transaction_case(transaction_case_id, auth.uid()));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.can_access_transaction_case(uuid, uuid) to authenticated, anon, service_role;
grant select, insert, update on public.commission_records to authenticated;

-- Semis (superuser) : dossier C (vendeur A), participants A/B/Bk, commission R (bénéf Bk).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),  -- A (vendeur)
  ('00000000-0000-0000-0000-0000000000b1'),  -- B (acheteur/participant)
  ('00000000-0000-0000-0000-00000000bbbb'),  -- Bk (bénéficiaire commission)
  ('00000000-0000-0000-0000-0000000000f1');  -- X (tiers, non participant)
insert into public.transaction_cases (id, seller_user_id) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1');
insert into public.test_access (case_id, uid) values
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1'),
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1'),
  ('0c000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000bbbb');
insert into public.commission_records (id, transaction_case_id, beneficiary_id, amount, status) values
  ('0d000000-0000-0000-0000-00000000000d', '0c000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-00000000bbbb', 100, 'pending');
