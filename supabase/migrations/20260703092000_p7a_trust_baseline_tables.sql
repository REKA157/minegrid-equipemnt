-- ============================================================================
-- P7a - Tables Trust canoniques (correctif MG-H01, partie 1/2)
-- ============================================================================
-- CONTEXTE
--   La migration 20260703093000_p7_trust_recompute_on_verification.sql declare
--   un trigger et une fonction sur public.trust_profiles et public.verifications.
--   Ces deux tables n'etaient creees NULLE PART dans la chaine de migrations :
--   uniquement dans le script manuel sql/nextgen/0001_trust_and_inspection.sql
--   et dans le fixture de test supabase/tests/p7_trust_recompute.prereq.sql.
--
--   Consequence reproduite sur base vierge :
--     ERROR: relation "public.trust_profiles" does not exist
--   La chaine s'arretait a la migration 8/39 ; les 31 suivantes n'etaient
--   jamais appliquees. Tout environnement neuf (staging, restauration,
--   disaster recovery) etait donc structurellement impossible a reconstruire.
--
-- DECISION
--   Ces tables entrent dans la chaine canonique, en amont de P7. Le script
--   manuel NextGen cesse d'etre la source de verite pour elles.
--   La definition retenue est la plus contrainte des trois variantes
--   existantes : celle de sql/nextgen/0001 (CHECK sur entity_type, trust_tier,
--   kind, status et bornes 0-100 sur le score), et non celle du fixture de
--   test, qui avait supprime toutes les contraintes.
--
-- IDEMPOTENCE
--   create table if not exists : si une base a deja recu le script NextGen,
--   cette migration ne recree rien. Les contraintes manquantes sont ajoutees
--   defensivement plus bas pour converger vers la forme canonique.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TRUST_PROFILES : profil de confiance d'un acteur (vendeur, acheteur, societe,
-- inspecteur). Le score est calcule cote serveur uniquement ; le client ne doit
-- jamais pouvoir l'ecrire (RLS ci-dessous + SECURITY DEFINER dans P7).
-- ---------------------------------------------------------------------------
create table if not exists public.trust_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  entity_type     text not null default 'seller'
                  check (entity_type in ('seller','buyer','company','inspector')),
  legal_name      text,
  country         text,
  trust_score     int  not null default 0 check (trust_score between 0 and 100),
  trust_tier      text not null default 'unverified'
                  check (trust_tier in ('unverified','basic','verified','trusted','elite')),
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, entity_type)
);

create index if not exists idx_trust_profiles_user
  on public.trust_profiles(user_id);

-- ---------------------------------------------------------------------------
-- VERIFICATIONS : pieces justificatives soumises puis revues. Le passage a
-- 'approved' declenche le recalcul du score (trigger installe par P7).
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id                uuid primary key default gen_random_uuid(),
  trust_profile_id  uuid not null references public.trust_profiles(id) on delete cascade,
  kind              text not null check (kind in
                    ('identity','company_registration','tax_id','bank_account',
                     'address','machine_document')),
  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  evidence_url      text,
  reviewer_id       uuid references auth.users(id),
  review_notes      text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_verifications_profile
  on public.verifications(trust_profile_id);
create index if not exists idx_verifications_status
  on public.verifications(status) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Convergence defensive : si les tables preexistent via le script NextGen ou un
-- fixture de test degrade, on reimpose les contraintes canoniques manquantes.
-- Chaque ajout est tente isolement : une base deja conforme n'est pas modifiee.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Borne du score : sans elle, un score arbitraire (cf. MG-H07, score 999)
  -- devient stockable.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trust_profiles'::regclass
      and conname  = 'trust_profiles_trust_score_check'
  ) then
    begin
      alter table public.trust_profiles
        add constraint trust_profiles_trust_score_check
        check (trust_score between 0 and 100);
    exception when others then
      raise notice 'trust_profiles_trust_score_check non applique: %', sqlerrm;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.verifications'::regclass
      and conname  = 'verifications_status_check'
  ) then
    begin
      alter table public.verifications
        add constraint verifications_status_check
        check (status in ('pending','approved','rejected'));
    exception when others then
      raise notice 'verifications_status_check non applique: %', sqlerrm;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS : deny-by-default. Le score de confiance est une donnee calculee, jamais
-- declarative. Aucune policy INSERT/UPDATE/DELETE n'est accordee au client sur
-- trust_profiles : seules les fonctions SECURITY DEFINER (P7) y ecrivent.
-- ---------------------------------------------------------------------------
alter table public.trust_profiles enable row level security;
alter table public.verifications  enable row level security;

-- Lecture : un utilisateur voit son propre profil de confiance.
drop policy if exists trust_profiles_select_own on public.trust_profiles;
create policy trust_profiles_select_own
  on public.trust_profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- Lecture : un utilisateur voit les verifications de ses propres profils.
drop policy if exists verifications_select_own on public.verifications;
create policy verifications_select_own
  on public.verifications for select to authenticated
  using (exists (
    select 1 from public.trust_profiles tp
    where tp.id = verifications.trust_profile_id
      and tp.user_id = (select auth.uid())
  ));

-- Soumission d'une piece : uniquement sur son propre profil, uniquement en
-- statut 'pending'. Le demandeur ne peut ni s'auto-approuver, ni se designer
-- reviewer, ni antidater la revue.
drop policy if exists verifications_insert_own_pending on public.verifications;
create policy verifications_insert_own_pending
  on public.verifications for insert to authenticated
  with check (
    status = 'pending'
    and reviewer_id is null
    and reviewed_at is null
    and exists (
      select 1 from public.trust_profiles tp
      where tp.id = verifications.trust_profile_id
        and tp.user_id = (select auth.uid())
    )
  );

-- Aucune policy UPDATE/DELETE cote client : la revue est une operation
-- serveur (service_role / RPC dediee). Le client ne peut pas faire passer
-- une verification a 'approved'.

revoke update, delete on public.verifications  from authenticated, anon;
revoke insert, update, delete on public.trust_profiles from authenticated, anon;

grant select on public.trust_profiles to authenticated;
grant select, insert on public.verifications to authenticated;

comment on table public.trust_profiles is
  'Profil de confiance calcule cote serveur. Ecriture client interdite (MG-H01/P7a).';
comment on table public.verifications is
  'Pieces justificatives. Le client soumet en pending ; la revue est serveur uniquement.';
