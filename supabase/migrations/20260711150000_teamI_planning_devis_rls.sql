-- =====================================================================
-- Phase I — RLS « privé par utilisateur » sur planning_events ET devis
-- =====================================================================
-- FAILLE fermée : côté app, les UPDATE/DELETE de ces deux tables sont scopés
-- par `id` SEUL (PlanningPro.tsx / DevisGenerator.tsx : .eq('id', …)). Sans RLS,
-- un utilisateur connaissant/devinant un id pouvait MODIFIER ou SUPPRIMER le
-- planning ou le devis d'un AUTRE. La lecture était bornée à user_id côté client,
-- mais un client forgé (devtools) contournait ce filtre.
--
-- Modèle : chacun ne voit/écrit QUE ses propres lignes (user_id = auth.uid()).
-- Les inserts posent déjà user_id = auth.uid() côté app ; le `with check` le rend
-- OBLIGATOIRE (impossible d'insérer/réattribuer une ligne à autrui).
--
-- Statements DIRECTS (aucun `do $$`, aucun `SELECT … INTO`) pour compat éditeur
-- SQL Supabase. Idempotente (policies recréées).
-- Pré-requis : les tables public.planning_events et public.devis existent déjà
-- (l'app les utilise). Colonne propriétaire : user_id.
-- =====================================================================

-- --------------------------- planning_events ---------------------------
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
