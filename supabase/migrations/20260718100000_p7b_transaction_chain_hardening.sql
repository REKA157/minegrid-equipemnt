-- ============================================================================
-- P7b - Durcissement de la chaine transactionnelle
-- Ferme MG-H02, MG-H03, MG-H05, MG-H07 (tous DEMONTRES par l'audit)
-- ============================================================================
-- Principe directeur : deny-by-default. Une operation n'est possible que si
-- une condition POSITIVE l'autorise, jamais parce qu'aucune condition ne
-- l'interdit. Les quatre vulnerabilites corrigees ici partagent la meme cause
-- structurelle : des predicats negatifs ("non revoque", "aucun assigne",
-- "aucune etape ouverte") tenaient lieu d'autorisation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MG-H02 (1/3) : predicat de participation
--
-- AVANT : _tc_is_party exigeait seulement `revoked_at is null`. Un participant
--         INVITE MAIS JAMAIS ACCEPTE (accepted_at NULL) etait donc traite comme
--         partie prenante : il lisait le dossier et appelait les RPC.
-- APRES : l'appartenance exige une acceptation effective. On separe en outre
--         trois notions qui etaient confondues :
--           _tc_is_party        -> peut LIRE le dossier
--           _tc_is_active_party -> peut MUTER (acceptation requise)
--           _tc_has_role        -> peut muter CE domaine metier precis
-- ---------------------------------------------------------------------------

create or replace function public._tc_is_active_party(p_case_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.transaction_cases c
    where c.id = p_case_id
      and (
        c.seller_user_id = p_uid
        or c.buyer_user_id = p_uid
        or exists (
          select 1 from public.transaction_participants tp
          where tp.case_id = p_case_id
            and tp.user_id = p_uid
            and tp.revoked_at is null
            and tp.accepted_at is not null              -- <- consentement exige
            and coalesce(tp.participant_status, 'accepted')
                not in ('declined','revoked','pending')
        )
      )
  );
$$;

-- Le predicat de LECTURE est aligne : un invite pending ne lit pas le dossier
-- avant d'avoir accepte (l'audit a demontre la lecture de 2 messages).
create or replace function public._tc_is_party(p_case_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select public._tc_is_active_party(p_case_id, p_uid);
$$;

-- Verifie qu'un utilisateur detient un role metier precis sur le dossier.
-- Les principals (vendeur/acheteur) ne heritent PAS des roles partenaires.
create or replace function public._tc_has_role(p_case_id uuid, p_uid uuid, p_role text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.transaction_participants tp
    where tp.case_id = p_case_id
      and tp.user_id = p_uid
      and tp.role    = p_role
      and tp.revoked_at is null
      and tp.accepted_at is not null
      and coalesce(tp.participant_status, 'accepted')
          not in ('declined','revoked','pending')
  );
$$;

-- ---------------------------------------------------------------------------
-- MG-H02 (2/3) : matrice role -> etape
--
-- AVANT : advance_transaction_case_step n'imposait ni role ni etat source.
--         Un courtier invite non accepte declenchait 'customs' sur un dossier
--         en 'draft' (saut direct demontre par l'audit).
-- APRES : seuls les principals ouvrent une etape ; l'ordre legal est impose.
-- ---------------------------------------------------------------------------

-- Rang d'une etape dans la chaine. Sert a interdire les sauts en avant.
create or replace function public._tc_step_rank(p_status text)
returns int language sql immutable set search_path to 'public'
as $$
  select case p_status
    when 'draft'      then 0
    when 'inspection' then 1
    when 'financing'  then 2
    when 'payment'    then 3
    when 'logistics'  then 4
    when 'customs'    then 5
    when 'closed'     then 6
    when 'cancelled'  then 6
    else 0
  end;
$$;

create or replace function public.advance_transaction_case_step(p_case_id uuid, p_step text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_new_status text;
  v_case public.transaction_cases%rowtype;
  v_target_rank int;
  v_current_rank int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Verrou pessimiste : empeche deux avancements concurrents de se croiser.
  select * into v_case from public.transaction_cases
   where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;

  -- Autorisation POSITIVE : ouvrir une etape est une prerogative des principals.
  -- Un partenaire execute son etape, il ne decide pas de la chaine.
  if not public._tc_is_principal(p_case_id, v_uid) then
    raise exception 'forbidden';
  end if;

  -- Etat source : un dossier termine est immuable.
  if v_case.status in ('closed','cancelled') then
    raise exception 'case_terminal_state: %', v_case.status;
  end if;

  -- Ordre legal : on n'avance que d'une etape non deja depassee.
  v_target_rank  := public._tc_step_rank(
                      case p_step when 'transport' then 'logistics' else p_step end);
  v_current_rank := public._tc_step_rank(v_case.status);

  if v_target_rank > v_current_rank + 1 then
    raise exception 'illegal_step_jump: % -> % (saut interdit)', v_case.status, p_step;
  end if;

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

  -- Compare-and-set : la transition n'est ecrite que depuis l'etat observe.
  if v_new_status is not null then
    update public.transaction_cases
       set status = v_new_status, updated_at = now()
     where id = p_case_id
       and status = v_case.status
       and status not in ('closed','cancelled');
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- MG-H07 : independance de l'inspection
--
-- AVANT : "mecanicien assigne OU principal si aucun assigne". La branche de
--         repli faisait du vendeur son propre inspecteur (mechanic_id = seller,
--         score 999 accepte). Conflit d'interets structurel sur le produit dont
--         la valeur est precisement la preuve d'etat du materiel.
-- APRES : seul un mecanicien assigne ET accepte peut completer. Aucun repli.
--         Le score est borne. Un principal est refuse explicitement.
-- ---------------------------------------------------------------------------

create or replace function public.complete_inspection_step(
  p_case_id uuid,
  p_condition_score integer default null,
  p_summary text default null,
  p_recommendations text default null
)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_insp public.inspection_requests%rowtype;
  v_report_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Borne du score AVANT toute ecriture (l'audit a obtenu 999).
  if p_condition_score is not null
     and (p_condition_score < 0 or p_condition_score > 100) then
    raise exception 'invalid_condition_score: % (attendu 0-100)', p_condition_score;
  end if;

  select * into v_insp from public.inspection_requests
   where transaction_case_id = p_case_id
   order by created_at desc limit 1
   for update;
  if not found then raise exception 'inspection_not_found'; end if;

  if v_insp.status = 'completed' then return v_insp.id; end if; -- idempotent

  -- Autorisation POSITIVE et UNIQUE : le mecanicien assigne.
  -- Plus aucune branche de repli vers les principals.
  if v_insp.assigned_to is null then
    raise exception 'inspection_not_assigned: aucun inspecteur habilite';
  end if;

  if v_insp.assigned_to is distinct from v_uid then
    raise exception 'forbidden';
  end if;

  -- Defense en profondeur : meme assigne, un principal ne s'auto-certifie pas.
  if public._tc_is_principal(p_case_id, v_uid) then
    raise exception 'conflict_of_interest: un principal ne peut pas inspecter';
  end if;

  update public.inspection_requests
     set status = 'completed'
   where id = v_insp.id;

  if p_summary is not null or p_condition_score is not null then
    insert into public.inspection_reports
      (inspection_request_id, transaction_case_id, mechanic_id,
       condition_score, summary, recommendations)
    values (v_insp.id, p_case_id, v_uid, p_condition_score, p_summary, p_recommendations)
    returning id into v_report_id;
  end if;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'inspection.completed',
    jsonb_build_object('inspection_request_id', v_insp.id, 'report_id', v_report_id));

  return v_insp.id;
end;
$$;

-- Le score est aussi borne au niveau du schema : une ecriture directe qui
-- contournerait la RPC reste refusee.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_reports'::regclass
      and conname  = 'inspection_reports_condition_score_check'
  ) then
    begin
      alter table public.inspection_reports
        add constraint inspection_reports_condition_score_check
        check (condition_score is null or condition_score between 0 and 100);
    exception when others then
      raise notice 'contrainte score non appliquee: %', sqlerrm;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- MG-H03 : cloture et annulation atomiques
--
-- AVANT : la cloture ne testait que l'ABSENCE d'etapes ouvertes -> un dossier
--         vide (draft, zero etape) passait 'closed'. L'annulation ignorait
--         totalement escrow et paiement -> dossier 'cancelled' avec escrow
--         'funded' et paiement 'held' : etat financier contradictoire.
-- APRES : preconditions POSITIVES pour clore ; reconciliation financiere
--         obligatoire pour annuler.
-- ---------------------------------------------------------------------------

create or replace function public.close_transaction_case(p_case_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_has_inspection boolean;
  v_escrow_blocking text;
  v_payment_blocking text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_case from public.transaction_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status = 'closed' then return p_case_id; end if; -- idempotent
  if v_case.status = 'cancelled' then raise exception 'case_cancelled'; end if;
  if not public._tc_is_principal(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- PRECONDITION POSITIVE : un dossier vide n'est pas un dossier abouti.
  select exists (
    select 1 from public.inspection_requests
    where transaction_case_id = p_case_id and status = 'completed'
  ) into v_has_inspection;

  if not v_has_inspection then
    raise exception 'empty_case_cannot_close: aucune etape d''execution aboutie';
  end if;

  -- Etapes encore ouvertes (controle conserve).
  if exists (
    select 1 from public.inspection_requests
    where transaction_case_id = p_case_id
      and status not in ('completed','cancelled','done')
  ) then raise exception 'inspection_not_completed'; end if;

  if exists (
    select 1 from public.transport_requests
    where transaction_case_id = p_case_id and status not in ('delivered','cancelled')
  ) then raise exception 'transport_not_delivered'; end if;

  if exists (
    select 1 from public.customs_cases
    where transaction_case_id = p_case_id and customs_status not in ('cleared','closed')
  ) then raise exception 'customs_not_cleared'; end if;

  -- RECONCILIATION FINANCIERE : on ne clot pas sur des fonds en suspens.
  select string_agg(distinct status, ',') into v_escrow_blocking
    from public.escrow_transactions
   where transaction_case_id = p_case_id
     and status in ('funded','inspection_passed','delivered','disputed');
  if v_escrow_blocking is not null then
    raise exception 'escrow_unsettled_on_close: %', v_escrow_blocking;
  end if;

  select string_agg(distinct status, ',') into v_payment_blocking
    from public.payment_records
   where transaction_case_id = p_case_id
     and status in ('held','pending','awaiting_partner','disputed');
  if v_payment_blocking is not null then
    raise exception 'payment_unsettled_on_close: %', v_payment_blocking;
  end if;

  update public.transaction_cases
     set status = 'closed', closed_at = now(), updated_at = now()
   where id = p_case_id and status = v_case.status;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'case.closed', jsonb_build_object('closed_by', v_uid));

  return p_case_id;
end;
$$;

create or replace function public.cancel_transaction_case(p_case_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_escrow_blocking text;
  v_payment_blocking text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_case from public.transaction_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status in ('closed','cancelled') then return p_case_id; end if; -- idempotent
  if not public._tc_is_principal(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- On refuse d'annuler tant que des fonds sont annonces sequestres : sinon le
  -- dossier affiche 'cancelled' pendant que l'escrow reste 'funded'.
  -- Le denouement financier (release/refund) doit preceder l'annulation.
  select string_agg(distinct status, ',') into v_escrow_blocking
    from public.escrow_transactions
   where transaction_case_id = p_case_id
     and status in ('funded','inspection_passed','delivered','disputed');
  if v_escrow_blocking is not null then
    raise exception 'escrow_must_be_settled_before_cancel: % (refund/release requis)',
      v_escrow_blocking;
  end if;

  select string_agg(distinct status, ',') into v_payment_blocking
    from public.payment_records
   where transaction_case_id = p_case_id
     and status in ('held','disputed');
  if v_payment_blocking is not null then
    raise exception 'payment_must_be_settled_before_cancel: %', v_payment_blocking;
  end if;

  update public.transaction_cases
     set status = 'cancelled', updated_at = now()
   where id = p_case_id and status = v_case.status;

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'case.cancelled', jsonb_build_object('reason', p_reason));

  return p_case_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- MG-H05 : audit trail non falsifiable
--
-- AVANT : policy INSERT autorisant tout participant a ecrire un evenement
--         arbitraire, avec `actor_user_id IS NULL` explicitement permis -
--         c'est-a-dire la convention "acteur systeme". L'audit a fabrique un
--         'escrow.released' sans acteur. Non-repudiation perdue.
-- APRES : plus aucun INSERT client direct. Les evenements systeme sont ecrits
--         exclusivement par les fonctions SECURITY DEFINER ci-dessus. Une RPC
--         allow-list couvre les evenements legitimement utilisateur.
-- ---------------------------------------------------------------------------

drop policy if exists "transaction_events_insert" on public.transaction_events;

revoke insert, update, delete on public.transaction_events from authenticated, anon;
revoke all on public.transaction_events from anon;
grant select on public.transaction_events to authenticated;

-- Provenance : distingue ce qui vient du client, du serveur, ou d'un PSP.
alter table public.transaction_events
  add column if not exists provenance text not null default 'system';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transaction_events'::regclass
      and conname  = 'transaction_events_provenance_check'
  ) then
    begin
      alter table public.transaction_events
        add constraint transaction_events_provenance_check
        check (provenance in ('user','system','provider'));
    exception when others then
      raise notice 'contrainte provenance non appliquee: %', sqlerrm;
    end;
  end if;
end
$$;

-- Un evenement 'user' DOIT porter son acteur : plus d'acteur NULL cote client.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transaction_events'::regclass
      and conname  = 'transaction_events_user_actor_required'
  ) then
    begin
      alter table public.transaction_events
        add constraint transaction_events_user_actor_required
        check (provenance <> 'user' or actor_user_id is not null);
    exception when others then
      raise notice 'contrainte acteur non appliquee: %', sqlerrm;
    end;
  end if;
end
$$;

-- Seule voie d'ecriture client : allow-list stricte d'evenements non financiers.
-- Les types 'escrow.*', 'case.*', 'inspection.*' sont exclus : ils ne peuvent
-- naitre que d'une transition serveur reelle.
create or replace function public.log_user_transaction_event(
  p_case_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not public._tc_is_active_party(p_case_id, v_uid) then
    raise exception 'forbidden';
  end if;

  if p_event_type not in ('note.added','document.viewed','message.sent') then
    raise exception 'event_type_not_allowed: %', p_event_type;
  end if;

  insert into public.transaction_events
    (case_id, actor_user_id, event_type, payload, provenance)
  values (p_case_id, v_uid, p_event_type, coalesce(p_payload,'{}'::jsonb), 'user')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_user_transaction_event(uuid, text, jsonb) to authenticated;
grant execute on function public._tc_is_active_party(uuid, uuid) to authenticated;
grant execute on function public._tc_has_role(uuid, uuid, text) to authenticated;
grant execute on function public._tc_step_rank(text) to authenticated;

comment on function public.log_user_transaction_event(uuid, text, jsonb) is
  'Seule voie d''ecriture client sur transaction_events. Allow-list non financiere (MG-H05).';
comment on table public.transaction_events is
  'Journal transactionnel. INSERT client interdit : provenance system/provider ecrite par SECURITY DEFINER uniquement (MG-H05).';
