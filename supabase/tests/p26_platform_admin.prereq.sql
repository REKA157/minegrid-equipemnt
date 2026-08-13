-- =====================================================================
-- PREREQ — fondation de la console d'administration (p26).
--
-- Enchaînement (cf. manifeste de run_all_proofs.sh) :
--   p26_platform_admin.prereq.sql
--   + 20260813120000_p26_platform_admin.sql
--   + p26_platform_admin.countercases.sql
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

-- `auth.uid()` pilotée par `test.uid` : vide = on agit comme depuis l'éditeur
-- SQL / la clé de service (exactement le cas du PREMIER administrateur).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table if not exists public._teststate (k text primary key, v text);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant all on public._teststate to authenticated;
