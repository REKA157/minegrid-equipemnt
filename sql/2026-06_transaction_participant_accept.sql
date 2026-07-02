-- =====================================================================
-- INVITATION PARTENAIRE — acceptation / refus par l'invité lui-même
-- =====================================================================
-- Suite de sql/2026-06_transaction_participant_assign.sql.
--
-- Un partenaire est rattaché à un dossier via assign_transaction_partner
-- (accepted_at = NULL = « invité, en attente »). Il doit pouvoir CONFIRMER
-- (accepted_at = now()) ou DÉCLINER (revoked_at = now()) SA propre invitation.
--
-- SÉCURITÉ :
--   • La policy UPDATE de transaction_participants est « vendeur seulement » ;
--     l'invité ne peut donc PAS écrire sa ligne en direct. On passe par ces
--     RPC SECURITY DEFINER (écriture contrôlée serveur), inchangée la policy.
--   • ANTI-USURPATION : on ne peut agir que sur SA propre ligne
--     (transaction_participants.user_id = auth.uid()), sinon « forbidden ».
--   • Rôle restreint à la liste blanche partenaire (pas seller/buyer/admin).
--   • IDEMPOTENCE : ré-accepter une invitation déjà acceptée renvoie l'id sans
--     ré-émettre d'événement ; idem pour un refus déjà posé.
--   • AUDIT : chaque action émet un transaction_events.
--
-- Idempotent : exécutable plusieurs fois (create or replace).
-- Pré-requis : sql/transaction_platform_core.sql + 2026-06_transaction_participant_assign.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ACCEPTER son invitation -> pose accepted_at.
-- ---------------------------------------------------------------------
create or replace function public.accept_transaction_invitation(p_participant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.transaction_participants%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.transaction_participants where id = p_participant_id;
  if not found then raise exception 'invitation_not_found'; end if;

  -- On n'accepte QUE sa propre invitation.
  if v_row.user_id <> v_uid then raise exception 'forbidden'; end if;

  if v_row.role not in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor') then
    raise exception 'invalid partner role: %', v_row.role;
  end if;

  if v_row.revoked_at is not null then raise exception 'invitation_revoked'; end if;

  -- Déjà accepté -> idempotent (pas de second événement).
  if v_row.accepted_at is not null then return v_row.id; end if;

  update public.transaction_participants
     set accepted_at = now()
   where id = p_participant_id and user_id = v_uid and revoked_at is null and accepted_at is null;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (v_row.case_id, v_uid, 'participant.accepted',
    jsonb_build_object('participant_id', v_row.id, 'role', v_row.role));

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) DÉCLINER son invitation -> pose revoked_at (réversible : le vendeur peut
--    ré-inviter, ce qui repart « en attente »).
-- ---------------------------------------------------------------------
create or replace function public.decline_transaction_invitation(p_participant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.transaction_participants%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_row from public.transaction_participants where id = p_participant_id;
  if not found then raise exception 'invitation_not_found'; end if;

  if v_row.user_id <> v_uid then raise exception 'forbidden'; end if;

  if v_row.role not in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor') then
    raise exception 'invalid partner role: %', v_row.role;
  end if;

  -- Déjà retiré -> idempotent.
  if v_row.revoked_at is not null then return v_row.id; end if;

  update public.transaction_participants
     set revoked_at = now()
   where id = p_participant_id and user_id = v_uid and revoked_at is null;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (v_row.case_id, v_uid, 'participant.declined',
    jsonb_build_object('participant_id', v_row.id, 'role', v_row.role));

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Grants — l'invité (authentifié) appelle ces RPC ; le contrôle
--    d'appartenance (user_id = auth.uid()) est fait DANS la fonction.
-- ---------------------------------------------------------------------
grant execute on function public.accept_transaction_invitation(uuid) to authenticated;
grant execute on function public.decline_transaction_invitation(uuid) to authenticated;

-- Vérification :
-- select proname from pg_proc where proname in ('accept_transaction_invitation','decline_transaction_invitation');
