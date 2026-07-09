-- =====================================================================
-- PREREQ pour prouver la sécurité de la connexion IA (org_ai_credentials).
-- Reproduit organisations + membres + auth.users, puis on concatène la
-- migration 20260709120000 puis les contre-cas.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgai -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamE_ai_credentials.prereq.sql \
--       supabase/migrations/20260709120000_teamE_ai_credentials.sql \
--       supabase/tests/teamE_ai_credentials.countercases.sql \
--     | docker exec -i pgai psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgai
-- Attendu : « TOUS LES CONTRE-CAS PASSES », exit 0.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

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
    check (role in ('owner', 'admin', 'manager', 'viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant select on public.organizations, public.organization_members to authenticated;
