-- =====================================================================
-- Phase I — Tables planning_events + devis (si absentes) + RLS privée
-- =====================================================================
-- Ces deux tables N'EXISTAIENT PAS en base (erreur 42P01) : « Mon planning » et
-- « Devis » ne pouvaient donc rien enregistrer. On les CRÉE (colonnes alignées
-- sur PlanningPro / DevisGenerator — camelCase QUOTÉES pour que PostgREST/Supabase
-- retrouve exactement les champs envoyés par le front) puis on pose la RLS.
--
-- FAILLE fermée du même coup : côté app, les UPDATE/DELETE sont scopés par `id`
-- SEUL (.eq('id', …)). Sans RLS, un utilisateur connaissant un id pourrait
-- modifier/supprimer le planning ou le devis d'un AUTRE. La RLS rend chaque ligne
-- privée (user_id = auth.uid()) ; le `with check` rend user_id obligatoire = soi.
--
-- Statements DIRECTS (aucun `do $$`, aucun `SELECT … INTO`) pour compat éditeur
-- SQL Supabase. Idempotente (create table IF NOT EXISTS + policies recréées).
-- =====================================================================

-- --------------------------- planning_events ---------------------------
create table if not exists public.planning_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  title         text,
  description   text,
  "startDate"   text,
  "endDate"     text,
  type          text,
  status        text,
  priority      text,
  "clientName"  text,
  "clientPhone" text,
  "clientEmail" text,
  location      text,
  "assignedTo"  text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists planning_events_user_id_idx on public.planning_events (user_id);

alter table public.planning_events enable row level security;

revoke all on public.planning_events from anon;
grant select, insert, update, delete on public.planning_events to authenticated;

drop policy if exists planning_events_select_own on public.planning_events;
drop policy if exists planning_events_insert_own on public.planning_events;
drop policy if exists planning_events_update_own on public.planning_events;
drop policy if exists planning_events_delete_own on public.planning_events;

create policy planning_events_select_own on public.planning_events
  for select to authenticated
  using (user_id = auth.uid());

create policy planning_events_insert_own on public.planning_events
  for insert to authenticated
  with check (user_id = auth.uid());

create policy planning_events_update_own on public.planning_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy planning_events_delete_own on public.planning_events
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------- devis ---------------------------------
create table if not exists public.devis (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  "devisNumber"   text,
  date            text,
  "clientName"    text,
  "clientCompany" text,
  "clientEmail"   text,
  "clientPhone"   text,
  "clientAddress" text,
  items           jsonb not null default '[]'::jsonb,
  subtotal        numeric,
  "taxRate"       numeric,
  "taxAmount"     numeric,
  total           numeric,
  notes           text,
  "validUntil"    text,
  status          text default 'draft',
  created_at      timestamptz not null default now()
);

create index if not exists devis_user_id_idx on public.devis (user_id);

alter table public.devis enable row level security;

revoke all on public.devis from anon;
grant select, insert, update, delete on public.devis to authenticated;

drop policy if exists devis_select_own on public.devis;
drop policy if exists devis_insert_own on public.devis;
drop policy if exists devis_update_own on public.devis;
drop policy if exists devis_delete_own on public.devis;

create policy devis_select_own on public.devis
  for select to authenticated
  using (user_id = auth.uid());

create policy devis_insert_own on public.devis
  for insert to authenticated
  with check (user_id = auth.uid());

create policy devis_update_own on public.devis
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy devis_delete_own on public.devis
  for delete to authenticated
  using (user_id = auth.uid());
