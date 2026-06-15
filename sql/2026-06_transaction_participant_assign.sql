-- =====================================================================
-- RÉSEAU PARTENAIRE — assignation contrôlée d'un partenaire au dossier
-- =====================================================================
-- Suite directe du write-side (sql/2026-06_transaction_chain_write_side.sql).
--
-- Problème résolu : les RPC create_*_step assignent une étape au participant du
-- rôle requis (mécanicien / courtier / transporteur / transitaire / logisticien /
-- investisseur) s'il existe, sinon « à assigner ». Tant qu'AUCUN participant
-- partenaire n'est ajouté au dossier, les cartes cockpit M4-M7 restent « à
-- assigner » et n'apparaissent jamais dans le cockpit du partenaire concerné.
-- Ce fichier ajoute le chemin d'écriture qui crée ces participants.
--
-- SÉCURITÉ (mêmes règles que le write-side) :
--   • SECURITY DEFINER : écriture contrôlée serveur ; le client appelle la RPC,
--     il n'écrit jamais transaction_participants directement.
--   • Seul un INVITEUR légitime du dossier peut assigner un partenaire :
--     le vendeur, l'acheteur, ou un participant 'admin_delegate' non révoqué.
--   • Rôle partenaire restreint à une liste blanche (pas seller/buyer/admin via ici).
--   • IDEMPOTENCE : ré-assigner le même (dossier, partenaire, rôle) réactive la
--     ligne au lieu d'en créer une seconde (clé unique case_id+user_id+role).
--   • PAS DE FAÇADE : le partenaire doit être un utilisateur réel (résolu par
--     email dans auth.users). Introuvable -> exception 'partner_not_found'
--     (jamais d'acteur fictif).
--
-- Idempotent : exécutable plusieurs fois (create or replace).
-- Pré-requis : sql/transaction_platform_core.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper : l'appelant peut-il INVITER sur ce dossier ?
--    (plus restrictif que _tc_is_party : un simple partenaire ne peut pas
--     en recruter d'autres — seuls vendeur / acheteur / admin_delegate).
-- ---------------------------------------------------------------------
create or replace function public._tc_can_invite(p_case_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (c.seller_user_id = p_uid or c.buyer_user_id = p_uid)
  )
  or exists (
    select 1 from public.transaction_participants tp
    where tp.case_id = p_case_id
      and tp.user_id = p_uid
      and tp.role = 'admin_delegate'
      and tp.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Assigner un partenaire (par email) à un rôle du dossier.
--    Renvoie l'id de la ligne transaction_participants.
-- ---------------------------------------------------------------------
create or replace function public.assign_transaction_partner(
  p_case_id uuid,
  p_role text,
  p_partner_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_email text := lower(trim(coalesce(p_partner_email, '')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Rôle partenaire autorisé via cette RPC (liste blanche).
  if p_role not in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor') then
    raise exception 'invalid partner role: %', p_role;
  end if;

  if not exists (select 1 from public.transaction_cases where id = p_case_id) then
    raise exception 'case not found';
  end if;

  if not public._tc_can_invite(p_case_id, v_uid) then
    raise exception 'forbidden';
  end if;

  if v_email = '' then raise exception 'partner email required'; end if;

  -- Résolution du partenaire : utilisateur RÉEL uniquement (anti-façade).
  select id into v_partner from auth.users where lower(email) = v_email limit 1;
  if v_partner is null then raise exception 'partner_not_found'; end if;

  -- Idempotence : (case_id, user_id, role) est unique. On réactive si révoqué.
  insert into public.transaction_participants (case_id, user_id, role, invited_by, invited_at, revoked_at)
  values (p_case_id, v_partner, p_role, v_uid, now(), null)
  on conflict (case_id, user_id, role)
  do update set revoked_at = null, invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'participant.assigned',
    jsonb_build_object('participant_id', v_id, 'role', p_role, 'partner_email', v_email));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Révoquer un partenaire (réversible : pose revoked_at).
-- ---------------------------------------------------------------------
create or replace function public.revoke_transaction_partner(
  p_case_id uuid,
  p_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_can_invite(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  update public.transaction_participants
     set revoked_at = now()
   where id = p_participant_id
     and case_id = p_case_id
     and role in ('mechanic', 'broker', 'carrier', 'forwarder', 'logistician', 'investor')
     and revoked_at is null
  returning id, role into v_id, v_role;

  if v_id is null then return null; end if;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'participant.revoked',
    jsonb_build_object('participant_id', v_id, 'role', v_role));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Grants — utilisateurs authentifiés (contrôle d'invitation dans la fonction).
-- ---------------------------------------------------------------------
grant execute on function public.assign_transaction_partner(uuid, text, text) to authenticated;
grant execute on function public.revoke_transaction_partner(uuid, uuid) to authenticated;

-- Vérification :
-- select proname from pg_proc where proname in ('assign_transaction_partner','revoke_transaction_partner','_tc_can_invite');
