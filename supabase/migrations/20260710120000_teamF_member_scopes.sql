-- =====================================================================
-- MODÈLE ÉQUIPE — Phase F : AFFECTATION par membre (Commercial / Appels d'offres)
--
-- Objectif : à l'invitation (ou depuis la fiche membre), l'admin décide à quels
-- ESPACES un membre est affecté :
--   - commercial : dashboard entreprise / pipeline / annonces ;
--   - tenders    : module Appels d'offres.
-- Le front redirige un membre hors des espaces auxquels il n'est PAS affecté.
--
-- Stockage SERVEUR (autoritaire, partagé, indépendant du navigateur) :
--   table organization_member_scopes (org, user) -> (commercial, tenders).
--
-- SÉCURITÉ :
--  - RLS : un membre lit les affectations de SA société uniquement (user_in_org) ;
--  - écritures UNIQUEMENT via set_member_scope (SECURITY DEFINER, admin de l'org) ;
--  - le PROPRIÉTAIRE garde toujours accès aux deux (pas d'auto-verrouillage) ;
--  - défaut = accès aux DEUX (aucune ligne -> aucun blocage : membres existants OK) ;
--  - search_path=public verrouillé sur les fonctions.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table des affectations par membre.
-- ---------------------------------------------------------------------
create table if not exists public.organization_member_scopes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  commercial      boolean not null default true,
  tenders         boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  primary key (organization_id, user_id)
);

alter table public.organization_member_scopes enable row level security;

-- Lecture : réservée aux membres de la MÊME société (jamais une autre société).
drop policy if exists org_member_scopes_select on public.organization_member_scopes;
create policy org_member_scopes_select on public.organization_member_scopes
  for select to authenticated
  using (public.user_in_org(organization_id, auth.uid()));

-- Écritures : aucune en direct — on force le passage par set_member_scope().
revoke all on public.organization_member_scopes from anon, authenticated;
grant select on public.organization_member_scopes to authenticated;

-- ---------------------------------------------------------------------
-- 2. Lire l'affectation de l'appelant (pour le gate de navigation).
--    Défaut (commercial=true, tenders=true) si aucune ligne -> aucun blocage.
-- ---------------------------------------------------------------------
create or replace function public.get_my_member_scope()
returns table (commercial boolean, tenders boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(s.commercial, true) as commercial,
    coalesce(s.tenders, true)    as tenders
  from public.organization_members me
  left join public.organization_member_scopes s
    on s.organization_id = me.organization_id
   and s.user_id = me.user_id
  where me.user_id = auth.uid()
  order by me.created_at
  limit 1;
$$;

grant execute on function public.get_my_member_scope() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Régler l'affectation d'un membre (admin/owner de SA société).
-- ---------------------------------------------------------------------
create or replace function public.set_member_scope(
  p_user_id    uuid,
  p_commercial boolean,
  p_tenders    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_role text;
begin
  -- Organisation de la CIBLE (le membre à régler).
  select organization_id, role
    into v_org, v_role
  from public.organization_members
  where user_id = p_user_id
  order by created_at
  limit 1;

  if v_org is null then
    raise exception 'Membre introuvable dans une organisation';
  end if;

  -- Seul un admin/owner de CETTE société peut régler l'affectation.
  if not public.user_in_org_admin(v_org, auth.uid()) then
    raise exception 'Réservé aux administrateurs de la société';
  end if;

  -- Le propriétaire garde toujours accès aux deux (jamais de verrouillage).
  if v_role = 'owner' then
    p_commercial := true;
    p_tenders := true;
  end if;

  -- Au moins une affectation.
  if not coalesce(p_commercial, false) and not coalesce(p_tenders, false) then
    raise exception 'Au moins une affectation (commercial ou appels d''offres) est requise';
  end if;

  insert into public.organization_member_scopes
    (organization_id, user_id, commercial, tenders, updated_at, updated_by)
  values
    (v_org, p_user_id, p_commercial, p_tenders, now(), auth.uid())
  on conflict (organization_id, user_id) do update
    set commercial = excluded.commercial,
        tenders    = excluded.tenders,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

grant execute on function public.set_member_scope(uuid, boolean, boolean) to authenticated;
