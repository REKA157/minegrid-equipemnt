/*
  Persistance des configurations dashboard Enterprise (shell)
  par utilisateur et par role metier.
  A executer dans l'editeur SQL Supabase (apres relecture des policies).
*/

create table if not exists public.enterprise_dashboard_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint enterprise_dashboard_configs_user_role unique (user_id, role)
);

create index if not exists enterprise_dashboard_configs_user_id_idx
  on public.enterprise_dashboard_configs (user_id);

alter table public.enterprise_dashboard_configs enable row level security;

drop policy if exists enterprise_dashboard_configs_select_own on public.enterprise_dashboard_configs;
create policy enterprise_dashboard_configs_select_own
  on public.enterprise_dashboard_configs
  for select
  using (auth.uid() = user_id);

drop policy if exists enterprise_dashboard_configs_insert_own on public.enterprise_dashboard_configs;
create policy enterprise_dashboard_configs_insert_own
  on public.enterprise_dashboard_configs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists enterprise_dashboard_configs_update_own on public.enterprise_dashboard_configs;
create policy enterprise_dashboard_configs_update_own
  on public.enterprise_dashboard_configs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists enterprise_dashboard_configs_delete_own on public.enterprise_dashboard_configs;
create policy enterprise_dashboard_configs_delete_own
  on public.enterprise_dashboard_configs
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.enterprise_dashboard_configs to authenticated;
