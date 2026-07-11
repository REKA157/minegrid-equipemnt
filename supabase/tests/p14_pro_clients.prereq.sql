-- PREREQ — verrouillage pro_clients (P14). Reproduit l'état PROD : écriture cliente
-- OUVERTE (insert/update own) -> auto-octroi d'abonnement. La migration doit fermer.

do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('test.uid', true), '')::uuid
$fn$;

create table if not exists public.pro_clients (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique,
  subscription_type   text,
  subscription_status text default 'free',
  payment_method      text,
  updated_at          timestamptz not null default now()
);

-- ÉTAT PROD (AVANT correctif) : le client peut insérer/mettre à jour SON abonnement.
alter table public.pro_clients enable row level security;
drop policy if exists "pro_clients_select_own" on public.pro_clients;
create policy "pro_clients_select_own" on public.pro_clients
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "pro_clients_insert_own" on public.pro_clients;
create policy "pro_clients_insert_own" on public.pro_clients
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "pro_clients_update_own" on public.pro_clients;
create policy "pro_clients_update_own" on public.pro_clients
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant select, insert, update on public.pro_clients to authenticated;

-- Semis : A a un compte GRATUIT ; B existe (isolation).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.pro_clients (user_id, subscription_type, subscription_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'gratuit', 'free'),
  ('00000000-0000-0000-0000-0000000000b1', 'enterprise', 'active');
