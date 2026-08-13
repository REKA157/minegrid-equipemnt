-- =====================================================================
-- PREREQ — écran « Abonnés » de la console (p27). Reprend le socle de p26 et y
-- ajoute le minimum : pro_clients, machines, organization_members.
--
-- Enchaînement (cf. manifeste de run_all_proofs.sh) :
--   p27_admin_subscribers.prereq.sql
--   + 20260813120000_p26_platform_admin.sql
--   + 20260813140000_p27_admin_subscribers.sql
--   + p27_admin_subscribers.countercases.sql
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

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table if not exists public.pro_clients (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  company_name        text not null default 'Minegrid Client',
  subscription_type   text not null,
  subscription_status text not null,
  subscription_start  timestamptz not null default now(),
  subscription_end    timestamptz,
  max_users           integer not null default 1,
  promo_code_used     text,
  payment_method      text,
  payment_amount      numeric(12,2),
  paddle_subscription_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pro_clients_subscription_status_check
    check (subscription_status in ('active','trialing','paid','inactive','suspended')),
  constraint pro_clients_subscription_type_check
    check (subscription_type in ('premium','pro','enterprise','entreprise'))
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null default 'viewer',
  primary key (organization_id, user_id)
);

-- Seule la colonne lue par la fiche client est nécessaire.
create table if not exists public.machines (
  id       uuid primary key default gen_random_uuid(),
  sellerid uuid
);

create table if not exists public._teststate (k text primary key, v text);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant all on public._teststate to authenticated;
