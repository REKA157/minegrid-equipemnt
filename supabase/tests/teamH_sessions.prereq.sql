-- =====================================================================
-- PREREQ pour prouver l'HISTORIQUE DES SESSIONS (member_sessions) sur base
-- jetable. Recrée le minimum Supabase + les tables société + les helpers org
-- (user_in_org / user_in_org_admin, cf. Phase 0/teamA) avant de concaténer la
-- migration teamH puis les contre-cas.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgsess -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamH_sessions.prereq.sql \
--       supabase/migrations/20260711140000_teamH_member_sessions.sql \
--       supabase/tests/teamH_sessions.countercases.sql \
--     | docker exec -i pgsess psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgsess
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
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Stub auth.uid() : lit l'uid injecté par le test via SET test.uid.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- Tables société (schéma canonique, cf. Phase 0).
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'viewer'
    check (role in ('owner', 'admin', 'manager', 'viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Helpers org (VERBATIM Phase 0/teamA — admin = owner/admin).
create or replace function public.user_in_org_admin(p_organization_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
      and m.role in ('owner', 'admin')
  );
$$;
create or replace function public.user_in_org(p_organization_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
  );
$$;

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.user_in_org(uuid, uuid), public.user_in_org_admin(uuid, uuid) to authenticated;
grant select on public.organizations, public.organization_members to authenticated;
