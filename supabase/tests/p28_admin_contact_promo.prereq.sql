-- =====================================================================
-- PREREQ — boîte de réception Contact et codes promo (p28).
--
-- Reproduit l'état RÉEL de `contact_messages` en production : RLS active, une
-- seule policy (insertion publique), et les GRANT trop larges de la baseline —
-- c'est justement ce que p28 vient resserrer.
--
-- Enchaînement :
--   p28_admin_contact_promo.prereq.sql
--   + 20260813120000_p26_platform_admin.sql
--   + 20260814100000_p28_admin_contact_promo.sql
--   + p28_admin_contact_promo.countercases.sql
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

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text,
  subject    text not null,
  message    text not null,
  service    text,
  status     text not null default 'new',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint contact_messages_status_check
    check (status in ('new', 'read', 'replied', 'archived'))
);

create table if not exists public.promo_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  subscription_type text not null default 'enterprise',
  duration_days     int  not null default 30,
  max_uses          int  not null default 1,
  uses_count        int  not null default 0,
  expires_at        timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id            uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id       uuid not null,
  redeemed_at   timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

-- ÉTAT D'AVANT, copie conforme de la baseline : RLS active, insertion publique
-- seule policy, mais des GRANT larges qui n'attendent qu'une policy de lecture
-- pour devenir une fuite.
alter table public.contact_messages enable row level security;
drop policy if exists "anon can insert contact messages" on public.contact_messages;
create policy "anon can insert contact messages" on public.contact_messages
  for insert to authenticated, anon with check (true);

grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant insert on public.contact_messages to anon;
grant select, insert, update on public.contact_messages to authenticated;
grant select on public.promo_codes to authenticated;
