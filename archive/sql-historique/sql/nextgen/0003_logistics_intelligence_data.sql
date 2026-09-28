-- =====================================================================
-- MINEGRID NEXTGEN — 0003 — LOGISTICS + MARKET INTELLIGENCE + DATA PLATFORM
-- =====================================================================
-- Logistique/dédouanement (apporteur), veille marché (consommation du
-- monitor-service existant) et la DATA PLATFORM = l'actif propriétaire
-- défendable (prix d'occasion observés, historique). Idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- LOGISTICS — MineGrid Logistics (devis transport + transit + douane)
-- ---------------------------------------------------------------------
create table if not exists public.logistics_quotes (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  machine_id    uuid,
  escrow_id     uuid,                          -- lie le transport à une transaction sécurisée
  origin        text not null,                 -- ex : 'Anvers, BE' / 'Tanger Med, MA'
  destination   text not null,                 -- ex : 'Abidjan, CI'
  incoterm      text default 'CIF' check (incoterm in ('EXW','FOB','CFR','CIF','DAP','DDP')),
  mode          text not null default 'sea' check (mode in ('road','sea','rail','multimodal')),
  weight_kg     int,
  price_amount  numeric(14,2),
  price_currency text not null default 'EUR',
  eta_days      int,
  carrier       text,
  status        text not null default 'requested'
                check (status in ('requested','quoted','booked','in_transit','customs','delivered','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_logistics_requester on public.logistics_quotes(requester_id);

create table if not exists public.customs_cases (
  id                 uuid primary key default gen_random_uuid(),
  logistics_quote_id uuid references public.logistics_quotes(id) on delete cascade,
  country            text not null,
  hs_code            text,                      -- ex : 8429 (engins de terrassement)
  duties_amount      numeric(14,2),
  status             text not null default 'pending' check (status in ('pending','submitted','cleared','held')),
  documents          jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- MARKET INTELLIGENCE — projets/appels d'offres (consommation du monitor)
-- ---------------------------------------------------------------------
create table if not exists public.market_projects (
  id           uuid primary key default gen_random_uuid(),
  source       text,                            -- portail public, scraper, partenaire
  country      text,
  sector       text check (sector in ('mining','btp','energy','infrastructure','other')),
  title        text not null,
  description  text,
  budget_amount numeric(16,2),
  budget_currency text default 'USD',
  phase        text check (phase in ('study','financed','tender','construction','operation')),
  lat          double precision,
  lng          double precision,
  starts_at    date,
  contacts     jsonb not null default '[]'::jsonb,
  fingerprint  text unique,                     -- dédup multi-sources
  created_at   timestamptz not null default now()
);
create index if not exists idx_market_projects_country on public.market_projects(country, sector);

create table if not exists public.market_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       jsonb not null default '{}'::jsonb,  -- {country, sector, equipment_types, min_budget}
  channel     text not null default 'email' check (channel in ('email','whatsapp','in_app')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_market_alerts_user on public.market_alerts(user_id);

-- ---------------------------------------------------------------------
-- DATA PLATFORM — l'actif propriétaire : observations de prix + événements
-- ---------------------------------------------------------------------
-- Chaque prix observé (annonce, vente, scraping, inspection) alimente un
-- référentiel propriétaire qui rend possibles l'estimation et le scoring.
create table if not exists public.price_observations (
  id            uuid primary key default gen_random_uuid(),
  machine_type  text,                           -- 'pelle', 'chargeuse', 'bulldozer'...
  brand         text,
  model         text,
  year          int check (year between 1950 and 2100),
  hours_meter   int,
  country       text,
  condition     text check (condition in ('new','used','refurbished')),
  price_amount  numeric(14,2) not null check (price_amount >= 0),
  price_currency text not null default 'EUR',
  source        text not null,                  -- 'listing','sale','inspection','partner','scraper'
  observed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_price_obs_lookup on public.price_observations(machine_type, brand, model, year);
create index if not exists idx_price_obs_country on public.price_observations(country, observed_at desc);

-- Event log append-only : la matière première de la data platform et de l'IA.
create table if not exists public.platform_events (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null,                   -- 'machine_viewed','quote_requested','inspection_passed'...
  subject_type text,                            -- 'machine','seller','buyer','transaction'
  subject_id   uuid,
  actor_id     uuid references auth.users(id),
  props        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_platform_events_subject on public.platform_events(subject_type, subject_id, created_at desc);

-- Sorties de modèles IA (estimation, scoring, fraude) — traçables et auditées.
create table if not exists public.ai_predictions (
  id           uuid primary key default gen_random_uuid(),
  model        text not null,                   -- 'price_estimate_v1','fraud_score_v1','seller_score_v1'
  subject_type text not null,
  subject_id   uuid,
  output       jsonb not null,                  -- {estimate, low, high} / {risk, reasons[]}
  confidence   numeric(4,3),
  created_at   timestamptz not null default now()
);
create index if not exists idx_ai_predictions_subject on public.ai_predictions(subject_type, subject_id, model);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.logistics_quotes   enable row level security;
alter table public.customs_cases       enable row level security;
alter table public.market_projects     enable row level security;
alter table public.market_alerts       enable row level security;
alter table public.price_observations  enable row level security;
alter table public.platform_events     enable row level security;
alter table public.ai_predictions      enable row level security;

-- logistics : le demandeur voit/crée ses devis.
drop policy if exists logistics_select_own on public.logistics_quotes;
create policy logistics_select_own on public.logistics_quotes
  for select to authenticated using (requester_id = auth.uid());
drop policy if exists logistics_insert_own on public.logistics_quotes;
create policy logistics_insert_own on public.logistics_quotes
  for insert to authenticated with check (requester_id = auth.uid() and status = 'requested');

-- customs : visible si le devis logistique parent est au demandeur.
drop policy if exists customs_select on public.customs_cases;
create policy customs_select on public.customs_cases
  for select to authenticated using (
    exists (select 1 from public.logistics_quotes lq
            where lq.id = customs_cases.logistics_quote_id and lq.requester_id = auth.uid())
  );

-- market_projects : la veille est un SERVICE PAYANT -> lecture réservée aux
-- abonnés actifs (table pro_clients héritée). Pas d'accès gratuit (audit finding).
drop policy if exists market_projects_select_paid on public.market_projects;
create policy market_projects_select_paid on public.market_projects
  for select to authenticated using (
    exists (select 1 from public.pro_clients pc
            where pc.user_id = auth.uid() and pc.subscription_status = 'active')
  );

-- market_alerts : le propriétaire gère ses alertes.
drop policy if exists market_alerts_own on public.market_alerts;
create policy market_alerts_own on public.market_alerts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- price_observations : agrégat propriétaire — PAS d'accès brut au client
-- (la valeur est exposée via des RPC d'estimation, pas en lecture de table).
-- Aucune policy SELECT -> deny par défaut ; service_role uniquement.

-- platform_events / ai_predictions : internes (deny par défaut, service_role).

-- Verrous d'écriture côté client.
revoke update, delete on public.logistics_quotes  from anon, authenticated;
revoke insert, update, delete on public.customs_cases     from anon, authenticated;
revoke insert, update, delete on public.market_projects   from anon, authenticated;
revoke insert, update, delete on public.price_observations from anon, authenticated;
revoke select, insert, update, delete on public.price_observations from anon;
revoke insert, update, delete on public.platform_events   from anon, authenticated;
revoke insert, update, delete on public.ai_predictions    from anon, authenticated;
