-- =====================================================================
-- P5 — RAIL RETOUR : transitions TERMINALES du dossier
-- =====================================================================
-- Le write-side existant (sql/2026-06_transaction_chain_write_side.sql) CRÉE les
-- étapes (create_*_step) mais aucune ne les TERMINE : aucun dossier ne pouvait
-- atteindre une clôture logique. Cette migration ajoute les RPC de complétion.
--
-- PRINCIPES (cf. règles) :
--   • SECURITY DEFINER + contrôle d'accès DANS chaque fonction.
--   • Chaque transition n'est permise qu'au PARTENAIRE ASSIGNÉ (ou, s'il n'y a pas
--     de partenaire assigné, au vendeur/acheteur qui a exécuté l'étape lui-même).
--   • Événement transaction_events à chaque transition (audit).
--   • Idempotent : si déjà à l'état terminal, on renvoie sans erreur.
--   • Transitions incohérentes bloquées (ex. clôturer avec un transport non livré).
--   • AUCUN argent : on NE crée AUCune transition escrow funded/released ici — cela
--     ne peut venir que du webhook PSP signé (non connecté). Vocabulaire de statut
--     aligné sur l'existant (pas de nouveau statut, pas d'usine à gaz).
-- Pré-requis : write_side + transaction_platform_core/extended.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper : l'appelant est-il un principal (vendeur ou acheteur) du dossier ?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tc_is_principal(p_case_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_cases c
    WHERE c.id = p_case_id AND (c.seller_user_id = p_uid OR c.buyer_user_id = p_uid)
  );
$$;

-- ---------------------------------------------------------------------
-- 1) INSPECTION terminée (par le mécanicien assigné, sinon un principal).
--    Renseigne un inspection_report si summary/score fournis. Statut -> 'completed'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_inspection_step(
  p_case_id uuid,
  p_condition_score integer DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_recommendations text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_insp public.inspection_requests%rowtype;
  v_report_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_insp from public.inspection_requests
   where transaction_case_id = p_case_id
   order by created_at desc limit 1;
  if not found then raise exception 'inspection_not_found'; end if;

  if v_insp.status = 'completed' then return v_insp.id; end if; -- idempotent

  -- Autorisation : mécanicien assigné, OU principal si aucun assigné.
  if not (
    v_insp.assigned_to = v_uid
    or (v_insp.assigned_to is null and public._tc_is_principal(p_case_id, v_uid))
  ) then
    raise exception 'forbidden';
  end if;

  update public.inspection_requests
     set status = 'completed'
   where id = v_insp.id;

  if p_summary is not null or p_condition_score is not null then
    insert into public.inspection_reports
      (inspection_request_id, transaction_case_id, mechanic_id, condition_score, summary, recommendations)
    values (v_insp.id, p_case_id, v_uid, p_condition_score, p_summary, p_recommendations)
    returning id into v_report_id;
  end if;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'inspection.completed',
    jsonb_build_object('inspection_request_id', v_insp.id, 'report_id', v_report_id));

  return v_insp.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) TRANSPORT livré (par le transporteur assigné, sinon un principal).
--    Statut -> 'delivered' + preuve de livraison optionnelle.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_delivery(
  p_case_id uuid,
  p_proof_path text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_tr public.transport_requests%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_tr from public.transport_requests
   where transaction_case_id = p_case_id
   order by updated_at desc limit 1;
  if not found then raise exception 'transport_not_found'; end if;

  if v_tr.status = 'delivered' then return v_tr.id; end if; -- idempotent

  if not (
    v_tr.transporter_id = v_uid
    or (v_tr.transporter_id is null and public._tc_is_principal(p_case_id, v_uid))
  ) then
    raise exception 'forbidden';
  end if;

  update public.transport_requests
     set status = 'delivered',
         proof_of_delivery_path = coalesce(p_proof_path, proof_of_delivery_path),
         updated_at = now()
   where id = v_tr.id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'transport.delivered',
    jsonb_build_object('transport_request_id', v_tr.id, 'has_proof', p_proof_path is not null));

  return v_tr.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) DOUANE dédouanée (par le transitaire assigné, sinon un principal).
--    Statut -> 'cleared'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_customs(p_case_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_cc public.customs_cases%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_cc from public.customs_cases
   where transaction_case_id = p_case_id
   order by updated_at desc limit 1;
  if not found then raise exception 'customs_not_found'; end if;

  if v_cc.customs_status in ('cleared', 'closed') then return v_cc.id; end if; -- idempotent

  if not (
    v_cc.forwarder_id = v_uid
    or (v_cc.forwarder_id is null and public._tc_is_principal(p_case_id, v_uid))
  ) then
    raise exception 'forbidden';
  end if;

  update public.customs_cases
     set customs_status = 'cleared', updated_at = now()
   where id = v_cc.id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'customs.cleared',
    jsonb_build_object('customs_case_id', v_cc.id));

  return v_cc.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) CLÔTURE du dossier (vendeur/acheteur uniquement).
--    Conditions minimales : aucune étape d'exécution encore OUVERTE.
--    Statut dossier -> 'closed' (+ closed_at).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_transaction_case(p_case_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status = 'closed' then return p_case_id; end if; -- idempotent
  if v_case.status = 'cancelled' then raise exception 'case_cancelled'; end if;
  if not public._tc_is_principal(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- Conditions minimales de cohérence : pas d'étape d'exécution encore ouverte.
  if exists (
    select 1 from public.inspection_requests
    where transaction_case_id = p_case_id and status not in ('completed', 'cancelled', 'done')
  ) then raise exception 'inspection_not_completed'; end if;

  if exists (
    select 1 from public.transport_requests
    where transaction_case_id = p_case_id and status not in ('delivered', 'cancelled')
  ) then raise exception 'transport_not_delivered'; end if;

  if exists (
    select 1 from public.customs_cases
    where transaction_case_id = p_case_id and customs_status not in ('cleared', 'closed')
  ) then raise exception 'customs_not_cleared'; end if;

  update public.transaction_cases
     set status = 'closed', closed_at = now(), updated_at = now()
   where id = p_case_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'case.closed', jsonb_build_object('closed_by', v_uid));

  return p_case_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) ANNULATION du dossier (vendeur/acheteur uniquement).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_transaction_case(p_case_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status in ('closed', 'cancelled') then return p_case_id; end if; -- idempotent
  if not public._tc_is_principal(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  update public.transaction_cases
     set status = 'cancelled', updated_at = now()
   where id = p_case_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'case.cancelled', jsonb_build_object('reason', p_reason));

  return p_case_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants (exécution authentifiée ; contrôle de rôle DANS chaque fonction).
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._tc_is_principal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_inspection_step(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_customs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_transaction_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transaction_case(uuid, text) TO authenticated;
