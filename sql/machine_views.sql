-- =====================================================================
-- Table `machine_views` : suivi leger des consultations de fiches machine.
-- A executer dans Supabase SQL Editor (dev/staging/prod selon besoin).
-- =====================================================================

create table if not exists public.machine_views (
  id          uuid primary key default gen_random_uuid(),
  machine_id  uuid not null,
  viewer_id   uuid,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists machine_views_machine_id_idx
  on public.machine_views (machine_id);

create index if not exists machine_views_created_at_idx
  on public.machine_views (created_at desc);

alter table public.machine_views enable row level security;

drop policy if exists "anon can insert machine views" on public.machine_views;
create policy "anon can insert machine views"
  on public.machine_views
  for insert
  to anon, authenticated
  with check (true);

revoke all on table public.machine_views from anon, authenticated;
grant insert on table public.machine_views to anon, authenticated;
grant select on table public.machine_views to authenticated;
