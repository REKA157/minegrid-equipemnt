-- Prérequis minimal pour éprouver p34 : les deux tables concernées, réduites
-- aux colonnes qui comptent, plus un jeu d'essai qui reproduit la production.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;

-- Un vendeur RÉEL et un acheteur existent bien dans auth.users.
-- Le vendeur fictif, lui, N'Y EST PAS — c'est tout le problème.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vendeur.reel@exemple.ma'),
  ('22222222-2222-2222-2222-222222222222', 'acheteur@exemple.ma')
on conflict do nothing;

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text,
  price text,
  sellerid uuid,
  seller_id uuid,
  user_id uuid,
  owner_id uuid
);

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid,
  seller_id uuid,
  buyer_user_id uuid,
  buyer_name text,
  buyer_email text,
  transaction_case_id uuid,
  updated_at timestamptz default now()
);

create table if not exists public.transaction_cases (
  id uuid primary key default gen_random_uuid(),
  kind text,
  status text,
  machine_id uuid,
  seller_user_id uuid,
  buyer_user_id uuid,
  total_amount numeric,
  currency text default 'MAD',
  created_at timestamptz default now()
);

-- Deux annonces, comme en production :
--   l'une du catalogue importé, dont les QUATRE colonnes portent le fantôme
--   l'autre déposée par un vrai vendeur
insert into public.machines (id, name, price, sellerid, seller_id, user_id, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Hitachi importée', '450000',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Pelle déposée par un vrai vendeur', '320000',
   '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   null, null)
on conflict do nothing;
