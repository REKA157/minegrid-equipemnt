-- =====================================================================
-- WRITE-SIDE DOSSIER (L3/L4) — création contrôlée des lignes de chaîne
-- =====================================================================
-- Objectif : créer au bon moment les lignes d'exécution d'un transaction_case
-- (inspection_requests / payment_records / financing_requests / transport_requests
-- / customs_cases) pour que les cartes cockpit M4-M7 deviennent visibles.
--
-- SÉCURITÉ (cf. règles) :
--   • Écritures via fonctions SECURITY DEFINER (privilèges du définisseur) — chemin
--     d'écriture CONTRÔLÉ serveur. Le client appelle supabase.rpc(...) ; il n'écrit
--     jamais directement ces tables sensibles.
--   • Chaque fonction vérifie que l'appelant (auth.uid()) est PARTIE PRENANTE du
--     dossier (participant non révoqué, ou vendeur/acheteur du dossier).
--   • IDEMPOTENCE : si une ligne ouverte existe déjà pour ce dossier, on la renvoie
--     (aucun doublon). Index uniques partiels en filet de sécurité.
--   • PAS DE SIMULATION : aucun paiement réel n'est créé. payment_records est posé en
--     statut 'awaiting_partner' (escrow en attente d'un partenaire), montant =
--     total du dossier s'il existe, 0 sinon (montant à confirmer, jamais inventé).
--   • Assignation : si aucun participant du rôle requis n'existe → statut « à
--     assigner » / champ d'assignation NULL (jamais d'acteur fictif).
--
-- Idempotent : exécutable plusieurs fois (create or replace, IF NOT EXISTS).
-- Pré-requis : sql/transaction_platform_core.sql + transaction_platform_extended.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Index uniques partiels — filet anti-doublon (une ligne OUVERTE par dossier).
-- ---------------------------------------------------------------------
create unique index if not exists inspection_requests_open_uniq
  on public.inspection_requests (transaction_case_id)
  where status not in ('completed', 'cancelled', 'done');

create unique index if not exists financing_requests_open_uniq
  on public.financing_requests (transaction_case_id)
  where status not in ('approved', 'funded', 'rejected', 'cancelled');

create unique index if not exists transport_requests_open_uniq
  on public.transport_requests (transaction_case_id)
  where status not in ('delivered', 'cancelled');

create unique index if not exists customs_cases_open_uniq
  on public.customs_cases (transaction_case_id)
  where customs_status not in ('cleared', 'closed');

create unique index if not exists payment_records_escrow_uniq
  on public.payment_records (transaction_case_id, payment_type)
  where status not in ('released', 'refunded', 'cancelled');

-- ---------------------------------------------------------------------
-- 1) Helper : l'appelant est-il partie prenante du dossier ?
-- ---------------------------------------------------------------------
create or replace function public._tc_is_party(p_case_id uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (
        c.seller_user_id = p_uid
        or c.buyer_user_id = p_uid
        or exists (
          select 1 from public.transaction_participants tp
          where tp.case_id = p_case_id and tp.user_id = p_uid and tp.revoked_at is null
        )
      )
  );
$$;

-- Cherche un participant d'un rôle donné (NULL si aucun → « à assigner »).
create or replace function public._tc_participant_of_role(p_case_id uuid, p_role text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tp.user_id
  from public.transaction_participants tp
  where tp.case_id = p_case_id and tp.role = p_role and tp.revoked_at is null
  order by tp.invited_at asc
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 2) INSPECTION — créée quand le dossier atteint l'étape inspection.
-- ---------------------------------------------------------------------
create or replace function public.create_inspection_step(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_mechanic uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- Idempotence : inspection ouverte déjà présente -> on la renvoie.
  select id into v_existing from public.inspection_requests
   where transaction_case_id = p_case_id and status not in ('completed', 'cancelled', 'done')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_mechanic := public._tc_participant_of_role(p_case_id, 'mechanic');

  insert into public.inspection_requests (transaction_case_id, machine_id, requested_by, assigned_to, status)
  values (
    p_case_id, v_case.machine_id, v_uid, v_mechanic,
    case when v_mechanic is null then 'a_assigner' else 'assigned' end
  )
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'inspection.requested',
    jsonb_build_object('inspection_request_id', v_id, 'assigned', v_mechanic is not null));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) PAIEMENT / ESCROW — créé quand l'inspection est validée (statut en attente partenaire).
--    Ne crée JAMAIS un paiement réel : status='awaiting_partner', montant = total dossier ou 0.
-- ---------------------------------------------------------------------
create or replace function public.create_payment_step(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_amount numeric;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.payment_records
   where transaction_case_id = p_case_id and payment_type = 'escrow'
     and status not in ('released', 'refunded', 'cancelled')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Montant = total du dossier s'il est renseigné, sinon 0 (à confirmer ; jamais inventé).
  v_amount := coalesce(v_case.total_amount, 0);

  insert into public.payment_records (transaction_case_id, payer_id, payee_id, amount, currency, payment_type, status)
  values (p_case_id, v_case.buyer_user_id, v_case.seller_user_id, v_amount,
    coalesce(v_case.currency, 'MAD'), 'escrow', 'awaiting_partner')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'escrow.awaiting_partner',
    jsonb_build_object('payment_record_id', v_id, 'amount', v_amount, 'note', 'escrow en attente de partenaire — aucun paiement reel'));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) FINANCEMENT — créé quand un financement est demandé (statut à examiner).
-- ---------------------------------------------------------------------
create or replace function public.create_financing_step(p_case_id uuid, p_amount numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_broker uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.financing_requests
   where transaction_case_id = p_case_id and status not in ('approved', 'funded', 'rejected', 'cancelled')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_broker := public._tc_participant_of_role(p_case_id, 'broker');

  insert into public.financing_requests (transaction_case_id, buyer_id, broker_id, requested_amount, currency, status, documents_status, scoring_status)
  values (p_case_id, v_case.buyer_user_id, v_broker,
    coalesce(p_amount, v_case.total_amount), coalesce(v_case.currency, 'MAD'),
    'a_examiner', 'pending', 'pending')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'financing.requested',
    jsonb_build_object('financing_request_id', v_id, 'broker_assigned', v_broker is not null));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) TRANSPORT — créé quand un transport/logistique est demandé (statut à planifier).
-- ---------------------------------------------------------------------
create or replace function public.create_transport_step(
  p_case_id uuid, p_pickup text default null, p_delivery text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_carrier uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.transport_requests
   where transaction_case_id = p_case_id and status not in ('delivered', 'cancelled')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_carrier := public._tc_participant_of_role(p_case_id, 'carrier');

  insert into public.transport_requests (transaction_case_id, transporter_id, pickup_location, delivery_location, status)
  values (p_case_id, v_carrier, p_pickup, p_delivery, 'a_planifier')
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'transport.requested',
    jsonb_build_object('transport_request_id', v_id, 'carrier_assigned', v_carrier is not null));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) DOUANE — créé pour un acheminement international (statut à traiter).
-- ---------------------------------------------------------------------
create or replace function public.create_customs_step(
  p_case_id uuid, p_origin text default null, p_destination text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_forwarder uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select id into v_existing from public.customs_cases
   where transaction_case_id = p_case_id and customs_status not in ('cleared', 'closed')
   order by updated_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_forwarder := public._tc_participant_of_role(p_case_id, 'forwarder');

  insert into public.customs_cases (transaction_case_id, forwarder_id, origin_country, destination_country, customs_status, missing_documents)
  values (p_case_id, v_forwarder, p_origin, p_destination, 'a_traiter', '[]'::jsonb)
  returning id into v_id;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'customs.opened',
    jsonb_build_object('customs_case_id', v_id, 'forwarder_assigned', v_forwarder is not null));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) ORCHESTRATEUR — avance le dossier à une étape et crée la ligne de chaîne.
--    Étapes : 'inspection' | 'payment' | 'financing' | 'transport' | 'customs'.
-- ---------------------------------------------------------------------
create or replace function public.advance_transaction_case_step(p_case_id uuid, p_step text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new_status text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  if p_step = 'inspection' then
    v_id := public.create_inspection_step(p_case_id);
  elsif p_step = 'payment' then
    v_id := public.create_payment_step(p_case_id);
    v_new_status := 'payment';
  elsif p_step = 'financing' then
    v_id := public.create_financing_step(p_case_id, null);
  elsif p_step = 'transport' then
    v_id := public.create_transport_step(p_case_id, null, null);
    v_new_status := 'logistics';
  elsif p_step = 'customs' then
    v_id := public.create_customs_step(p_case_id, null, null);
    v_new_status := 'customs';
  else
    raise exception 'unknown step: %', p_step;
  end if;

  -- Avance le statut du dossier seulement pour les étapes qui mappent un statut.
  if v_new_status is not null then
    update public.transaction_cases
       set status = v_new_status, updated_at = now()
     where id = p_case_id and status <> v_new_status;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Grants — exécution réservée aux utilisateurs authentifiés (le contrôle de
--    participation est fait DANS chaque fonction). anon n'a aucun accès.
-- ---------------------------------------------------------------------
grant execute on function public.create_inspection_step(uuid) to authenticated;
grant execute on function public.create_payment_step(uuid) to authenticated;
grant execute on function public.create_financing_step(uuid, numeric) to authenticated;
grant execute on function public.create_transport_step(uuid, text, text) to authenticated;
grant execute on function public.create_customs_step(uuid, text, text) to authenticated;
grant execute on function public.advance_transaction_case_step(uuid, text) to authenticated;

-- Vérification (lecture) :
-- select proname from pg_proc where proname like '%_step' or proname = 'advance_transaction_case_step';
