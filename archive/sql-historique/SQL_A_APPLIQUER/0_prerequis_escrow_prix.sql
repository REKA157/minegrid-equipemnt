-- ============================================================
--   PRÉREQUIS (sûr) — tables escrow + prix pour activer P1 & P5
-- ============================================================
-- La couche "nextgen" n'est PAS déployée en prod. Ce script crée UNIQUEMENT
-- les 3 tables NEUVES nécessaires au pont escrow (7) et au flywheel prix (8) :
--   escrow_transactions, escrow_events, price_observations.
-- Il N'INCLUT PAS sql/nextgen/0001 (trust) ni les tables en conflit
-- (inspection_requests / customs_cases) — à traiter séparément (dette P7).
-- Extrait fidèlement de sql/nextgen/0002 et 0003. Idempotent.
--
-- ORDRE DE DÉPLOIEMENT : ce script -> 7_pont_escrow.sql -> 8_price_flywheel.sql
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ESCROW (système A) — séquestre conditionné à l'inspection/livraison.
-- MineGrid ne porte jamais les fonds : escrow_transactions = miroir d'état PSP.
-- ---------------------------------------------------------------------
create table if not exists public.escrow_transactions (
  id                    uuid primary key default gen_random_uuid(),
  machine_id            uuid not null,
  buyer_id              uuid not null references auth.users(id) on delete restrict,
  seller_id             uuid not null references auth.users(id) on delete restrict,
  amount                numeric(14,2) not null check (amount > 0),
  currency              text not null default 'EUR',
  status                text not null default 'created' check (status in
                        ('created','funded','inspection_passed','delivered','released','refunded','disputed','cancelled')),
  inspection_report_id  uuid,
  provider              text,
  provider_ref          text,
  release_conditions    jsonb not null default '{"inspection":true,"delivery":true}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_escrow_buyer  on public.escrow_transactions(buyer_id);
create index if not exists idx_escrow_seller on public.escrow_transactions(seller_id);
create index if not exists idx_escrow_status on public.escrow_transactions(status);

create table if not exists public.escrow_events (
  id          uuid primary key default gen_random_uuid(),
  escrow_id   uuid not null references public.escrow_transactions(id) on delete cascade,
  event_type  text not null,
  actor_id    uuid references auth.users(id),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_escrow_events_escrow on public.escrow_events(escrow_id, created_at);

alter table public.escrow_transactions enable row level security;
alter table public.escrow_events       enable row level security;

drop policy if exists escrow_select_party on public.escrow_transactions;
create policy escrow_select_party on public.escrow_transactions
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists escrow_events_select_party on public.escrow_events;
create policy escrow_events_select_party on public.escrow_events
  for select to authenticated using (
    exists (select 1 from public.escrow_transactions e
            where e.id = escrow_events.escrow_id
              and (e.buyer_id = auth.uid() or e.seller_id = auth.uid()))
  );

-- Aucune écriture directe côté client : escrow piloté par le serveur (PSP/webhook).
revoke insert, update, delete on public.escrow_transactions from anon, authenticated;
revoke insert, update, delete on public.escrow_events       from anon, authenticated;

-- ---------------------------------------------------------------------
-- PRIX — observations de marché (agrégat propriétaire, deny par défaut).
-- ---------------------------------------------------------------------
create table if not exists public.price_observations (
  id             uuid primary key default gen_random_uuid(),
  machine_type   text,
  brand          text,
  model          text,
  year           int check (year between 1950 and 2100),
  hours_meter    int,
  country        text,
  condition      text check (condition in ('new','used','refurbished')),
  price_amount   numeric(14,2) not null check (price_amount >= 0),
  price_currency text not null default 'EUR',
  source         text not null,
  observed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.price_observations enable row level security;
-- Pas de policy SELECT -> deny par défaut ; exposée via RPC d'estimation seulement.
revoke insert, update, delete on public.price_observations from anon, authenticated;
revoke select, insert, update, delete on public.price_observations from anon;

-- Vérification :
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name in ('escrow_transactions','escrow_events','price_observations');
