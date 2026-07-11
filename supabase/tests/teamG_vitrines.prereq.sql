-- =====================================================================
-- PREREQ pour prouver la RLS `vitrines` sur une base jetable.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgvit -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamG_vitrines.prereq.sql \
--       supabase/migrations/20260711120000_teamG_vitrines_rls.sql \
--       supabase/tests/teamG_vitrines.countercases.sql \
--     | docker exec -i pgvit psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgvit
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

-- Table vitrines minimale (colonnes utiles au test ; user_id = propriétaire).
create table if not exists public.vitrines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  company_name text,
  updated_at   timestamptz not null default now()
);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
-- Grants « façon Supabase » : les rôles ont les privilèges table, la RLS est le
-- VRAI garde (on prouve donc bien la RLS, pas un simple GRANT).
grant select, insert, update, delete on public.vitrines to authenticated;
grant select on public.vitrines to anon;
