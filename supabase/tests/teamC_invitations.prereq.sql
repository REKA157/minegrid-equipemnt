-- =====================================================================
-- PREREQ pour prouver les invitations par lien (create/accept_invitation).
-- Reproduit l'environnement société minimal + auth.users. On concatène ensuite
-- la migration 20260708140000_teamC_invitations.sql puis les contre-cas.
--
-- EXÉCUTION (Docker Postgres) :
--   docker run -d --rm --name pginv -e POSTGRES_PASSWORD=x -e POSTGRES_DB=test postgres:16-alpine
--   cat supabase/tests/teamC_invitations.prereq.sql \
--       supabase/migrations/20260708140000_teamC_invitations.sql \
--       supabase/tests/teamC_invitations.countercases.sql \
--     | docker exec -i pginv psql -U postgres -d test -v ON_ERROR_STOP=1
--   docker stop pginv
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
    check (role in ('owner', 'admin', 'manager', 'viewer')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- user_in_org_admin (copie conforme de la Phase 0 : owner/admin/manager).
create or replace function public.user_in_org_admin(p_organization_id uuid, p_uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
      and m.role in ('owner', 'admin', 'manager')
  );
$$;

-- Petite table pour transmettre le jeton d'une étape (rôle) à l'autre.
create table if not exists public._teststate (k text primary key, v text);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.user_in_org_admin(uuid, uuid) to authenticated;
grant select, insert, update, delete on public.organizations, public.organization_members to authenticated;
grant all on public._teststate to authenticated;
