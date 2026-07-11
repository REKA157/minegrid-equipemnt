-- =====================================================================
-- Phase J — enterprise_dashboard_configs : DDL + RLS (port versionné)
-- =====================================================================
-- Cette table (config des tableaux de bord Enterprise, par user + rôle) ne
-- vivait que dans sql/enterprise_dashboard_configs.sql (« à exécuter à la main »)
-- — AUCUNE migration versionnée ne la créait, donc un nouvel environnement
-- pouvait naître SANS sa RLS. On la porte ici pour qu'elle soit reproductible et
-- auditée comme les autres tables. Contenu idempotent + durcissement (revoke anon).
--
-- RLS : chaque utilisateur ne lit/écrit QUE ses propres configs (auth.uid() = user_id).
-- Statements directs (aucun do $$ / SELECT INTO) pour compat éditeur Supabase.
-- =====================================================================

create table if not exists public.enterprise_dashboard_configs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint enterprise_dashboard_configs_user_role unique (user_id, role)
);

create index if not exists enterprise_dashboard_configs_user_id_idx
  on public.enterprise_dashboard_configs (user_id);

alter table public.enterprise_dashboard_configs enable row level security;

revoke all on public.enterprise_dashboard_configs from anon;
grant select, insert, update, delete on public.enterprise_dashboard_configs to authenticated;

drop policy if exists enterprise_dashboard_configs_select_own on public.enterprise_dashboard_configs;
drop policy if exists enterprise_dashboard_configs_insert_own on public.enterprise_dashboard_configs;
drop policy if exists enterprise_dashboard_configs_update_own on public.enterprise_dashboard_configs;
drop policy if exists enterprise_dashboard_configs_delete_own on public.enterprise_dashboard_configs;

create policy enterprise_dashboard_configs_select_own
  on public.enterprise_dashboard_configs
  for select to authenticated
  using (auth.uid() = user_id);

create policy enterprise_dashboard_configs_insert_own
  on public.enterprise_dashboard_configs
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy enterprise_dashboard_configs_update_own
  on public.enterprise_dashboard_configs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy enterprise_dashboard_configs_delete_own
  on public.enterprise_dashboard_configs
  for delete to authenticated
  using (auth.uid() = user_id);
