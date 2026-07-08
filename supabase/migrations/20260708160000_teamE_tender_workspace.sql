-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 6 : espace de travail PARTAGÉ « Appels d'offres ».
--
-- Le module Appels d'offres (src/tenders) était 100 % local (localStorage).
-- Pour la collaboration réelle (l'admin affecte un AO à un salarié, le
-- salarié le voit sur SON poste), on partage l'état du module au niveau de
-- la SOCIÉTÉ, dans une seule ligne JSONB par organisation — sur le modèle
-- déjà éprouvé de enterprise_dashboard_configs (config jsonb par org).
--
-- Contenu du JSONB : { tenders[], documents[], library[], company }.
-- Le tri « qui traite quoi » se fait côté client via tender.leadWriterId.
--
-- SÉCURITÉ :
--  - Lecture : réservée aux membres de la société (RLS SELECT via user_in_org).
--  - Écriture : INTERDITE en direct (REVOKE) ; passe par save_my_tender_workspace()
--    (SECURITY DEFINER) qui impose l'org de l'appelant — le client ne choisit
--    jamais son organization_id.
--  - Résolution de l'org : owner-prioritaire, comme le reste du modèle équipe.
--  - search_path=public verrouillé. Idempotente.
--
-- LIMITE ASSUMÉE (v1) : dernière écriture gagnante au niveau de la société.
-- Deux membres qui sauvegardent au même instant peuvent s'écraser ; suffisant
-- pour une petite équipe, à durcir plus tard (verrouillage optimiste updated_at).
-- =====================================================================

create table if not exists public.tender_workspaces (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  data            jsonb        not null default '{}'::jsonb,
  updated_at      timestamptz  not null default now(),
  updated_by      uuid         references auth.users(id) on delete set null
);

alter table public.tender_workspaces enable row level security;

-- Droits de base : lecture pour authenticated (filtrée par RLS), écriture
-- révoquée (forcée par RPC — défense en profondeur, comme user_invitations).
grant select on public.tender_workspaces to authenticated;
revoke insert, update, delete on public.tender_workspaces from authenticated, anon, public;

-- Purge d'éventuelles anciennes policies pour éviter tout cumul permissif.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tender_workspaces'
  loop
    execute format('drop policy if exists %I on public.tender_workspaces', p.policyname);
  end loop;
end $$;

-- SELECT : tout membre de la société voit l'espace de travail de sa société.
create policy tender_workspaces_select_team
  on public.tender_workspaces
  for select
  using (public.user_in_org(organization_id, auth.uid()));

-- ---------------------------------------------------------------------
-- Lecture : espace de travail de MA société (owner-prioritaire).
-- ---------------------------------------------------------------------
create or replace function public.get_my_tender_workspace()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(tw.data, '{}'::jsonb)
  from public.organization_members om
  left join public.tender_workspaces tw on tw.organization_id = om.organization_id
  where om.user_id = auth.uid()
  order by (om.role = 'owner') desc, om.created_at asc
  limit 1
$$;

grant execute on function public.get_my_tender_workspace() to authenticated;

-- ---------------------------------------------------------------------
-- Écriture : enregistre l'espace de travail de MA société (upsert).
-- L'org est imposée serveur-side ; le client ne fournit que le JSONB.
-- Renvoie l'org écrite (ou null si l'appelant n'appartient à aucune société).
-- ---------------------------------------------------------------------
create or replace function public.save_my_tender_workspace(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Écriture réservée aux membres qui PEUVENT modifier (owner/admin/manager) :
  -- un rôle 'viewer' (lecture seule, et rôle par défaut) ne doit jamais
  -- écraser l'espace partagé. Aligné sur user_in_org_admin / leads_update_team.
  select om.organization_id into v_org
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.role in ('owner', 'admin', 'manager')
  order by (om.role = 'owner') desc, om.created_at asc
  limit 1;

  if v_org is null then
    -- Pas de société OU rôle lecteur seul : le client retombe en local
    -- (aucune écriture possible ; les viewers gardent la lecture via RLS).
    return null;
  end if;

  insert into public.tender_workspaces (organization_id, data, updated_at, updated_by)
  values (v_org, coalesce(p_data, '{}'::jsonb), now(), auth.uid())
  on conflict (organization_id)
  do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();

  return v_org;
end;
$$;

grant execute on function public.save_my_tender_workspace(jsonb) to authenticated;
