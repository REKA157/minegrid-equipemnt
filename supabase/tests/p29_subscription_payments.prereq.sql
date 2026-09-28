-- =====================================================================
-- PREREQ — registre des paiements d'abonnement (p29).
--
-- Enchaînement :
--   p29_subscription_payments.prereq.sql
--   + 20260813120000_p26_platform_admin.sql
--   + 20260814130000_p29b_subscription_payments.sql
--   + p29_subscription_payments.countercases.sql
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

-- Colonne visée par le `comment on column` de la migration : sans la table, la
-- migration échouerait.
create table if not exists public.pro_clients (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  payment_amount numeric(12,2)
);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
