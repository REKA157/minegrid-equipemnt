-- PREREQ — codes promo sécurisés (P15). pro_clients est VERROUILLÉE (état post-p14) :
-- on prouve que la RPC redeem_promo_code (SECURITY DEFINER) active quand même.

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

-- pro_clients VERROUILLÉE (comme après p14) : aucune écriture cliente.
create table if not exists public.pro_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  subscription_type text,
  subscription_status text default 'free',
  subscription_start date,
  subscription_end date,
  payment_method text,
  updated_at timestamptz not null default now()
);
alter table public.pro_clients enable row level security;
drop policy if exists pro_clients_select_own on public.pro_clients;
create policy pro_clients_select_own on public.pro_clients for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.pro_clients from anon, authenticated;
grant select on public.pro_clients to authenticated;

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1');
