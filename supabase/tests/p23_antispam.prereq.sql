-- =====================================================================
-- Prereq P23 — tables publiques minimales + rôle anon + seed « historique ».
-- Le seed (15 lignes datées de -5 min pour flood@a.com) est posé AVANT que la
-- migration ne crée le trigger -> non throttlé, sert à tester la fenêtre horaire.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema public to anon;

-- Tables minimales (seules les colonnes lues par le trigger comptent)
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_email text,
  created_at timestamptz not null default now()
);
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Conditions réelles : anon peut INSÉRER mais n'a AUCUNE policy SELECT
alter table public.quote_requests enable row level security;
alter table public.contact_messages enable row level security;
create policy qr_ins_anon on public.quote_requests for insert to anon with check (true);
create policy cm_ins_anon on public.contact_messages for insert to anon with check (true);
grant insert on public.quote_requests to anon;
grant insert on public.contact_messages to anon;

-- Seed historique (dans l'heure, hors fenêtre rafale de 2 min)
insert into public.quote_requests(buyer_email, created_at)
select 'flood@a.com', now() - interval '5 minutes' from generate_series(1, 15);
insert into public.quote_requests(buyer_email, created_at)
select 'ok@c.com', now() - interval '5 minutes' from generate_series(1, 2);
