-- =====================================================================
-- PREREQ RLS pour les CONTRE-CAS P7 — reproduit fidèlement l'environnement
-- Supabase minimal : rôle `authenticated`, `auth.uid()`, et les policies RLS
-- de sql/nextgen/0001 (verbatim) sur verifications + trust_profiles.
-- `postgres` (superuser) joue le rôle du service_role (BYPASSRLS).
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

-- Stub auth.uid() : lit l'uid injecté par le test via SET.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table if not exists public.trust_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null default 'seller',
  trust_score int  not null default 0,
  trust_tier  text not null default 'unverified',
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.verifications (
  id               uuid primary key default gen_random_uuid(),
  trust_profile_id uuid not null references public.trust_profiles(id) on delete cascade,
  kind             text not null,
  status           text not null default 'pending',
  created_at       timestamptz not null default now()
);
create table if not exists public.inspection_requests (id uuid primary key default gen_random_uuid(), requester_id uuid, status text default 'requested');
create table if not exists public.inspection_reports  (id uuid primary key default gen_random_uuid(), request_id uuid, certified boolean not null default false, overall_grade text);
create table if not exists public.escrow_transactions (id uuid primary key default gen_random_uuid(), buyer_id uuid, seller_id uuid, status text not null default 'created');

-- Grants façon Supabase : le rôle authenticated a les privilèges table,
-- la RLS est le VRAI garde (on prouve donc bien la RLS, pas un simple GRANT).
grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant select, insert, update, delete on public.verifications  to authenticated;
grant select on public.trust_profiles to authenticated, anon;

alter table public.trust_profiles enable row level security;
alter table public.verifications  enable row level security;

-- Policies VERBATIM de sql/nextgen/0001 :
drop policy if exists trust_profiles_select_public on public.trust_profiles;
create policy trust_profiles_select_public on public.trust_profiles
  for select to anon, authenticated using (true);
-- (aucune policy insert/update/delete sur trust_profiles -> réservé service_role)

drop policy if exists verifications_select_own on public.verifications;
create policy verifications_select_own on public.verifications
  for select to authenticated using (
    exists (select 1 from public.trust_profiles tp
            where tp.id = verifications.trust_profile_id and tp.user_id = auth.uid())
  );
drop policy if exists verifications_insert_own on public.verifications;
create policy verifications_insert_own on public.verifications
  for insert to authenticated with check (
    status = 'pending'
    and exists (select 1 from public.trust_profiles tp
                where tp.id = verifications.trust_profile_id and tp.user_id = auth.uid())
  );
-- (aucune policy update/delete pour authenticated -> approbation/rejet = service_role)
