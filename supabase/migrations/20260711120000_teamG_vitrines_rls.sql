-- =====================================================================
-- Phase G — Table `vitrines` (si absente) + RLS propriétaire
-- =====================================================================
-- La table `vitrines` (vitrine personnalisée de la société) n'existait pas sur
-- la base : le feature vitrine ne pouvait rien enregistrer. On la CRÉE (colonnes
-- alignées sur VitrinePersonnalisee) et on pose la RLS (patron `machines`).
--
--   - SELECT public (vitrine = page publique) ;
--   - INSERT authentifié + trigger FORCE user_id = auth.uid() (anti-usurpation) ;
--   - UPDATE / DELETE réservés au propriétaire (user_id = auth.uid()).
-- Idempotent (create table IF NOT EXISTS + policies recréées).
-- =====================================================================

create table if not exists public.vitrines (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid,
  company_name         text,
  logo_url             text,
  description          text,
  services             text[] default '{}',
  address              text,
  phone                text,
  email                text,
  website              text,
  working_hours        text,
  specializations      text[] default '{}',
  certifications       text[] default '{}',
  business_type        text default 'both',
  founding_year        integer,
  intervention_zone    text,
  equipment_count      integer default 0,
  projects_delivered   integer default 0,
  whatsapp             text,
  emergency_phone      text,
  delivery_radius      integer,
  min_rental_duration  integer,
  deposit_required     boolean default false,
  fuel_included        boolean default false,
  driver_included      boolean default false,
  maintenance_included boolean default false,
  warranty_months      integer,
  delivery_time_weeks  integer,
  transport_included   boolean default false,
  installation_included boolean default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Une seule vitrine par utilisateur.
create unique index if not exists vitrines_user_id_key on public.vitrines (user_id);

grant select on public.vitrines to anon, authenticated;
grant insert, update, delete on public.vitrines to authenticated;

-- Trigger anti-usurpation : propriété TOUJOURS forcée à auth.uid() (client menteur impossible).
create or replace function public.vitrines_force_owner_fn()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

alter table public.vitrines enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'vitrines'
  loop
    execute format('drop policy if exists %I on public.vitrines', pol.policyname);
  end loop;
end $$;

drop trigger if exists trg_vitrines_force_owner on public.vitrines;
create trigger trg_vitrines_force_owner
  before insert on public.vitrines
  for each row execute function public.vitrines_force_owner_fn();

create policy vitrines_select_public on public.vitrines
  for select using (true);

create policy vitrines_insert_own on public.vitrines
  for insert to authenticated
  with check (auth.uid() is not null and user_id = auth.uid());

create policy vitrines_update_own on public.vitrines
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy vitrines_delete_own on public.vitrines
  for delete to authenticated
  using (user_id = auth.uid());
