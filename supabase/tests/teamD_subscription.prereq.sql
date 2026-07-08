-- =====================================================================
-- PREREQ pour prouver get_effective_subscription() sur une base jetable.
-- Reproduit organisations + membres + pro_clients (abonnements). On concatène
-- ensuite la migration 20260708150000 puis les contre-cas.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pgsub -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamD_subscription.prereq.sql \
--       supabase/migrations/20260708150000_teamD_shared_subscription.sql \
--       supabase/tests/teamD_subscription.countercases.sql \
--     | docker exec -i pgsub psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pgsub
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

-- Abonnements (sous-ensemble suffisant de pro_clients).
create table if not exists public.pro_clients (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  company_name        text,
  subscription_type   text,
  subscription_status text,
  subscription_end    timestamptz
);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
-- On ne donne PAS de SELECT sur pro_clients à authenticated : c'est le
-- SECURITY DEFINER de get_effective_subscription() qui lit, de façon scopée.
grant select on public.organizations, public.organization_members to authenticated;
