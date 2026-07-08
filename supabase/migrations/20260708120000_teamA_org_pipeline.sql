-- =====================================================================
-- MODÈLE ÉQUIPE — Phase 0 : le pipeline (leads) devient scopé par SOCIÉTÉ.
--
-- Réutilise la brique multi-société existante (organizations /
-- organization_members / user_in_org_admin, cf. sql/transaction_platform_extended.sql)
-- déjà branchée sur les dossiers de transaction, et l'étend aux `leads`.
--
-- Sécurité (une erreur = fuite de leads entre sociétés) :
--   - SELECT : un membre voit les leads de SA société (fonction can_access_lead) ;
--   - INSERT : organization_id est FORCÉ à la société du créateur (le client ne
--     peut pas injecter un lead dans une autre société) ;
--   - UPDATE : organization_id et seller_id sont IMMUABLES côté client (pas de
--     déplacement d'un lead vers une autre société) ; modif réservée
--     créateur / assigné / admin de la société ;
--   - fonctions SECURITY DEFINER SET search_path = public (anti-récursion RLS).
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- Prouvé en local avant application (supabase/tests/teamA_pipeline.*.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Brique société (canonicalisée ici ; no-op si déjà déployée par les
--    transactions). On NE touche PAS aux policies existantes d'organizations.
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'manager', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

-- Membre admin de la société (owner/admin/manager) — droits d'écriture élargis.
create or replace function public.user_in_org_admin(p_organization_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
      and m.role in ('owner', 'admin', 'manager')
  );
$$;
grant execute on function public.user_in_org_admin(uuid, uuid) to authenticated;

-- Membre (TOUT rôle, viewer compris) — pour la VISIBILITÉ en lecture.
create or replace function public.user_in_org(p_organization_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_uid
  );
$$;
grant execute on function public.user_in_org(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Colonnes société / assignation sur `leads`.
--    (`assigned_to` existe déjà en TEXT — libellé ; on ajoute une vraie FK user.)
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.leads
  add column if not exists assigned_to_user_id uuid references auth.users (id) on delete set null;

create index if not exists leads_org_idx
  on public.leads (organization_id) where organization_id is not null;
create index if not exists leads_assigned_user_idx
  on public.leads (assigned_to_user_id) where assigned_to_user_id is not null;

-- ---------------------------------------------------------------------
-- 3. Fonction d'accès en LECTURE (modèle can_access_transaction_case).
-- ---------------------------------------------------------------------
create or replace function public.can_access_lead(p_lead_id uuid, p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and (
        l.seller_id = p_uid                                   -- legacy / non encore rattaché
        or (l.organization_id is not null
            and public.user_in_org(l.organization_id, p_uid)) -- membre de la société
      )
  );
$$;
grant execute on function public.can_access_lead(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Garde d'intégrité (SECURITY DEFINER : lit organization_members malgré la RLS).
--    INSERT : force organization_id = société du créateur, assigne à lui par défaut.
--    UPDATE : organization_id et seller_id restent ceux d'origine (immuables client).
--    service_role (auth.uid() NULL : imports / backfill) : non modifié.
-- ---------------------------------------------------------------------
create or replace function public.leads_guard_fn()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.organization_id := (
        select m.organization_id
        from public.organization_members m
        where m.user_id = auth.uid()
        order by (m.role = 'owner') desc, m.created_at asc
        limit 1
      );
      if new.assigned_to_user_id is null then
        new.assigned_to_user_id := auth.uid();
      end if;
    elsif tg_op = 'UPDATE' then
      new.organization_id := old.organization_id;  -- pas de déplacement inter-société
      new.seller_id := old.seller_id;              -- propriété d'origine préservée
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_guard_ins on public.leads;
create trigger trg_leads_guard_ins
  before insert on public.leads
  for each row execute function public.leads_guard_fn();

drop trigger if exists trg_leads_guard_upd on public.leads;
create trigger trg_leads_guard_upd
  before update on public.leads
  for each row execute function public.leads_guard_fn();

-- ---------------------------------------------------------------------
-- 5. Remplacement des policies « par utilisateur » par des policies « société ».
--    (Piège RLS : les policies se combinent en OR -> on DROP toutes les
--     anciennes, y compris « read as buyer », avant de recréer.)
-- ---------------------------------------------------------------------
drop policy if exists "users can read own leads"     on public.leads;
drop policy if exists "users can read leads as buyer" on public.leads;
drop policy if exists "users can insert own leads"   on public.leads;
drop policy if exists "users can update own leads"   on public.leads;
drop policy if exists "users can delete own leads"   on public.leads;
drop policy if exists leads_select_team on public.leads;
drop policy if exists leads_insert_own on public.leads;
drop policy if exists leads_update_team on public.leads;
drop policy if exists leads_delete_own on public.leads;

create policy leads_select_team on public.leads
  for select to authenticated
  using (
    public.can_access_lead(id, auth.uid())
    or (buyer_user_id is not null and buyer_user_id = auth.uid())  -- l'acheteur voit son lead
  );

create policy leads_insert_own on public.leads
  for insert to authenticated
  with check (seller_id = auth.uid());  -- org posée par le trigger

create policy leads_update_team on public.leads
  for update to authenticated
  using (
    seller_id = auth.uid()
    or assigned_to_user_id = auth.uid()
    or (organization_id is not null and public.user_in_org_admin(organization_id, auth.uid()))
  )
  with check (
    seller_id = auth.uid()
    or assigned_to_user_id = auth.uid()
    or (organization_id is not null and public.user_in_org_admin(organization_id, auth.uid()))
  );

create policy leads_delete_own on public.leads
  for delete to authenticated
  using (
    seller_id = auth.uid()
    or (organization_id is not null and public.user_in_org_admin(organization_id, auth.uid()))
  );

grant select, insert, update, delete on table public.leads to authenticated;
