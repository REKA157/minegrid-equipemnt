-- =====================================================================
-- PREREQ pour prouver le durcissement de l'appartenance à une société (p25).
--
-- Reproduit l'état RÉEL D'AVANT correction, tel qu'il est en production :
--   - la règle permissive `organization_members_insert_admin` de la baseline
--     (celle qui laisse n'importe qui s'inscrire propriétaire n'importe où) ;
--   - les GRANT larges de la baseline sur organizations / organization_members ;
--   - pro_clients (abonnement + max_users) pour la limite de sièges.
--
-- Enchaînement (cf. manifeste de run_all_proofs.sh) :
--   p25_org_membership.prereq.sql
--   + 20260708140000_teamC_invitations.sql        (table + fonctions d'origine)
--   + 20260812120000_p25_org_membership_hardening.sql   (la correction)
--   + p25_org_membership.countercases.sql
-- Attendu : « TOUS LES CONTRE-CAS PASSES », exit 0.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'viewer'
    check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Abonnement (colonnes utiles seulement). max_users est posé par le webhook
-- Paddle : pro 1, premium 1, enterprise 5.
create table if not exists public.pro_clients (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  company_name        text,
  subscription_type   text,
  subscription_status text,
  subscription_end    timestamptz,
  max_users           integer not null default 1
);

create or replace function public.user_in_org_admin(p_organization_id uuid, p_uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
      and m.role in ('owner', 'admin', 'manager')
  );
$$;

create table if not exists public._teststate (k text primary key, v text);

-- ---------- L'ÉTAT D'AVANT : RLS + règle permissive de la baseline ----------
alter table public.organization_members enable row level security;
alter table public.organizations         enable row level security;

-- La faille C1, copie conforme de 00000000000000_baseline.sql : le seul contrôle
-- porte sur `user_id`, RIEN sur la société visée ni sur le rôle demandé.
drop policy if exists "organization_members_insert_admin" on public.organization_members;
create policy "organization_members_insert_admin" on public.organization_members
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "organization_members_select_self" on public.organization_members;
create policy "organization_members_select_self" on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
  for select to authenticated
  using (exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id and m.user_id = (select auth.uid())
  ));

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.user_in_org_admin(uuid, uuid) to authenticated;

-- GRANT larges de la baseline (« GRANT ALL ... TO anon, authenticated »).
grant all on public.organizations         to anon, authenticated, service_role;
grant all on public.organization_members  to anon, authenticated, service_role;
grant select on public.pro_clients        to authenticated;
grant all on public._teststate            to authenticated;
