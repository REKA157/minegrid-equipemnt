-- =====================================================================
-- Preuve locale teamE (espace AO partagé) — PRÉREQUIS (Docker Postgres).
-- Bootstrap façon Supabase (rôles + auth.uid() stubé via GUC test.uid) +
-- fondations société minimales + jeux d'essai : sociétés A et B, un viewer.
-- =====================================================================

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid
language sql stable
as $auth_uid$ select nullif(current_setting('test.uid', true), '')::uuid $auth_uid$;

do $do_roles$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $do_roles$;

grant usage on schema public to authenticated, anon;

-- Fondations société (miroir minimal de la baseline prod/staging).
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create or replace function public.user_in_org(p_organization_id uuid, p_uid uuid)
returns boolean
language sql security definer set search_path = public stable
as $fn_uio$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_uid
  )
$fn_uio$;

-- Tables touchées par le rattachement (backfill).
create table if not exists public.pro_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_name text not null default 'Minegrid Client'
);
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid,
  organization_id uuid,
  assigned_to_user_id uuid
);

-- Jeux d'essai : 2 sociétés abonnées (A, B).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test'),
  ('00000000-0000-0000-0000-00000000000b', 'ownerB@test'),
  ('00000000-0000-0000-0000-00000000000c', 'viewerA@test');
insert into public.pro_clients (user_id, company_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Société A'),
  ('00000000-0000-0000-0000-00000000000b', 'Société B');
