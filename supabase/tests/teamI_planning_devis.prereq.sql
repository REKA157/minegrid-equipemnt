-- =====================================================================
-- PREREQ pour prouver la RLS planning_events + devis sur base jetable.
-- Crée le minimum Supabase (rôles + auth.uid() stub) et des tables minimales
-- (colonne propriétaire user_id). Les grants + RLS sont posés par la MIGRATION.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgpd -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamI_planning_devis.prereq.sql \
--       supabase/migrations/20260711150000_teamI_planning_devis_rls.sql \
--       supabase/tests/teamI_planning_devis.countercases.sql \
--     | docker exec -i pgpd psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgpd
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

-- Tables minimales (colonnes réellement écrites par l'app + user_id).
create table if not exists public.planning_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  title       text,
  "startDate" text,
  status      text,
  created_at  timestamptz not null default now()
);
create table if not exists public.devis (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  client      text,
  total       numeric,
  created_at  timestamptz not null default now()
);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
-- Grants de table + RLS : posés par la MIGRATION.
