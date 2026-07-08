-- =====================================================================
-- PREREQ pour prouver la RLS « société » du pipeline sur une base jetable.
-- Reproduit l'environnement Supabase minimal, puis on concatène la migration
-- 20260708120000_teamA_org_pipeline.sql, puis teamA_pipeline.countercases.sql.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgteam -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamA_pipeline.prereq.sql \
--       supabase/migrations/20260708120000_teamA_org_pipeline.sql \
--       supabase/tests/teamA_pipeline.countercases.sql \
--     | docker exec -i pgteam psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgteam
-- Attendu : « TOUS LES CONTRE-CAS PASSES », exit 0.
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

-- Table `leads` de base (sous-ensemble de sql/pipeline_leads.sql suffisant pour
-- la preuve). La migration y AJOUTE organization_id / assigned_to_user_id + RLS.
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null,
  title         text not null default 'lead',
  stage         text not null default 'Prospection',
  priority      text not null default 'medium',
  value         numeric not null default 0,
  buyer_user_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.leads enable row level security;

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant select, insert, update, delete on public.leads to authenticated;
