-- =====================================================================
-- P7 — TRUST : rendre le verbe « RECALCULER » réel (déclencheur + écrivain)
-- =====================================================================
-- Constat d'audit : le moteur de score existait (Edge `recompute-trust-score`)
-- mais restait ORPHELIN — rien ne le déclenchait. Résultat : approuver une
-- vérification ne changeait jamais le score → badge figé.
--
-- Cette migration ajoute l'ÉCRIVAIN autorisé (fonction SECURITY DEFINER, donc
-- côté serveur, le client ne peut toujours pas écrire trust_profiles) et le
-- DÉCLENCHEUR manquant : dès qu'une `verifications` change d'état (approuvée /
-- rejetée), le profil lié est recalculé. Comme SEUL le service_role peut
-- approuver (RLS 0001 : aucune policy UPDATE cliente), aucune auto-approbation
-- n'est possible — pas de façade.
--
-- Le barème RÉPLIQUE src/nextgen/trust/computeTrustScore.ts (identité 15,
-- RC 15, fiscal 10, bancaire 10, adresse 5, doc 5 ; inspections ×15 ; escrow
-- released ≤10 ; ancienneté ≤5 ; −10/litige ; plancher : pas de tier ≥ verified
-- sans identité). Lit les mêmes tables que l'Edge. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ÉCRIVAIN autorisé : recalcule un profil depuis les données réelles.
--    SECURITY DEFINER = tourne avec les droits du propriétaire (écrit
--    trust_profiles, table interdite au client). Défensif sur les tables
--    des autres modules (inspection/escrow) via to_regclass.
-- ---------------------------------------------------------------------
create or replace function public.recompute_trust_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile      public.trust_profiles%rowtype;
  v_verif_points int := 0;
  v_has_identity boolean := false;
  v_insp_total   int := 0;
  v_insp_passed  int := 0;
  v_insp_points  int := 0;
  v_completed    int := 0;
  v_disputes     int := 0;
  v_tx_points    int := 0;
  v_age_days     numeric := 0;
  v_tenure_points int := 0;
  v_raw          int;
  v_score        int;
  v_tier         text;
begin
  select * into v_profile from public.trust_profiles where id = p_profile_id;
  if not found then return; end if;

  -- Vérifications APPROUVÉES, uniques par kind, plafonnées à 60.
  select coalesce(sum(pts), 0), coalesce(bool_or(kind = 'identity'), false)
    into v_verif_points, v_has_identity
  from (
    select distinct kind,
      case kind
        when 'identity' then 15
        when 'company_registration' then 15
        when 'tax_id' then 10
        when 'bank_account' then 10
        when 'address' then 5
        when 'machine_document' then 5
        else 0
      end as pts
    from public.verifications
    where trust_profile_id = p_profile_id and status = 'approved'
  ) d;
  v_verif_points := least(v_verif_points, 60);

  -- Inspections certifiées (grade ≠ F) de cet utilisateur.
  if to_regclass('public.inspection_reports') is not null
     and to_regclass('public.inspection_requests') is not null then
    select count(*) filter (where r.certified),
           count(*) filter (where r.certified and r.overall_grade is not null and r.overall_grade <> 'F')
      into v_insp_total, v_insp_passed
    from public.inspection_reports r
    join public.inspection_requests q on q.id = r.request_id
    where q.requester_id = v_profile.user_id;
    if v_insp_total > 0 then
      v_insp_points := round((v_insp_passed::numeric / v_insp_total) * 15);
    end if;
  end if;

  -- Transactions escrow libérées (+) et litiges (−).
  if to_regclass('public.escrow_transactions') is not null then
    select count(*) filter (where status = 'released'),
           count(*) filter (where status = 'disputed')
      into v_completed, v_disputes
    from public.escrow_transactions
    where buyer_id = v_profile.user_id or seller_id = v_profile.user_id;
  end if;
  v_tx_points := least(coalesce(v_completed, 0), 10);

  -- Ancienneté du compte (max 5, plafonné à 180 j).
  v_age_days := extract(epoch from (now() - v_profile.created_at)) / 86400.0;
  v_tenure_points := round(least(greatest(v_age_days, 0) / 180.0, 1) * 5);

  v_raw := v_verif_points + v_insp_points + v_tx_points + v_tenure_points - coalesce(v_disputes, 0) * 10;
  v_score := greatest(0, least(100, v_raw));

  v_tier := case
    when v_score >= 80 then 'elite'
    when v_score >= 60 then 'trusted'
    when v_score >= 40 then 'verified'
    when v_score >= 20 then 'basic'
    else 'unverified'
  end;
  -- Plancher de sécurité : un acteur non identifié ne peut pas être « trusted ».
  if not v_has_identity and v_tier in ('verified', 'trusted', 'elite') then
    v_tier := 'basic';
  end if;

  update public.trust_profiles
     set trust_score = v_score,
         trust_tier  = v_tier,
         verified_at = case when v_has_identity then coalesce(verified_at, now()) else null end,
         updated_at  = now()
   where id = p_profile_id;
end;
$$;

-- Le client n'a pas besoin d'appeler cette fonction (le trigger s'en charge).
revoke execute on function public.recompute_trust_profile(uuid) from public;
grant execute on function public.recompute_trust_profile(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2) DÉCLENCHEUR : recalcule le profil quand une vérification change d'état.
--    Seul le service_role peut faire passer une vérif à 'approved'/'rejected'
--    (RLS 0001), donc ce trigger ne s'arme que sur une décision autoritaire.
-- ---------------------------------------------------------------------
create or replace function public.trg_verification_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'approved')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    perform public.recompute_trust_profile(new.trust_profile_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifications_recompute on public.verifications;
create trigger trg_verifications_recompute
  after insert or update of status on public.verifications
  for each row execute function public.trg_verification_recompute();
