-- =====================================================================
-- PREREQ pour prouver le scope de get_org_members() sur une base jetable.
-- Auto-suffisant : recrée l'environnement minimal (auth.users, user_profiles,
-- organizations, organization_members) SANS dépendre de la migration Phase 0
-- ni de la table leads. On concatène ensuite la migration Phase 3 puis les
-- contre-cas.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgmemb -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamB_members.prereq.sql \
--       supabase/migrations/20260708130000_teamB_org_members_rpc.sql \
--       supabase/tests/teamB_members.countercases.sql \
--     | docker exec -i pgmemb psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgmemb
-- Attendu : « TOUS LES CONTRE-CAS PASSES », exit 0.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
-- auth.users réel a bien email + last_sign_in_at : on les reproduit.
create table if not exists auth.users (
  id              uuid primary key,
  email           text,
  last_sign_in_at timestamptz
);

-- Stub auth.uid() : lit l'uid injecté par le test via SET test.uid.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- Profils utilisateurs (sous-ensemble suffisant de user_profiles).
create table if not exists public.user_profiles (
  id         uuid primary key,
  first_name text,
  last_name  text,
  email      text,
  phone      text
);

-- Tables société (schéma canonique, cf. migration Phase 0).
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

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
-- NB : on ne donne PAS à `authenticated` de SELECT sur user_profiles/auth.users.
-- C'est justement le SECURITY DEFINER de get_org_members() qui autorise la lecture,
-- de façon scopée. On accorde seulement la lecture des tables société.
grant select on public.organizations, public.organization_members to authenticated;
