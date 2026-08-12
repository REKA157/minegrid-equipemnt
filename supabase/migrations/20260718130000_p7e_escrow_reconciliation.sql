-- ============================================================================
-- P7e - Reconciliation escrow cote serveur (MG-H08)
-- ============================================================================
-- CONSTAT
--   Le webhook `escrow-webhook` verifie la signature, applique une table de
--   transitions et utilise un verrou optimiste : c'est deja solide. Mais il ne
--   reconcilie QUE l'id et le statut. Il n'impose ni montant, ni devise, ni
--   beneficiaire, ni `release_conditions`, et sa table de transitions autorise
--   `disputed -> released`.
--
--   Consequence : un evenement PSP signe mais errone (ou un secret compromis)
--   peut faire passer un escrow en `released` pour un montant, une devise ou un
--   beneficiaire qui ne correspondent pas au dossier, et solder un litige en
--   liberation directe sans arbitrage.
--
-- CHOIX D'ARCHITECTURE
--   Les invariants financiers descendent en base, dans une RPC unique appelee
--   par le webhook. Trois raisons :
--     1. l'audit exige des conditions de release verifiees COTE SERVEUR;
--     2. une regle en Edge Function n'est verifiable que via un PSP reel, alors
--        qu'en base elle est testable sur une base jetable (c'est le cas ici);
--     3. tout autre chemin d'ecriture (script, autre function, correction
--        manuelle) herite automatiquement des memes garanties.
--
--   Le webhook reste responsable de la signature ; la base devient responsable
--   de la coherence financiere.
--
-- PERIMETRE
--   Aucune integration PSP n'est ajoutee. `create-escrow` reste absente et
--   l'escrow ne doit toujours pas etre active en production (cf. BLOCKERS).
--   Ce correctif garantit que SI un evenement arrive, il ne peut pas produire
--   un etat financier incoherent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Deduplication par identifiant d'evenement PSP.
-- L'idempotence actuelle repose sur "statut deja atteint". Elle ne protege pas
-- du rejeu d'un evenement DIFFERENT portant le meme effet, ni ne conserve la
-- trace des rejeux. Un identifiant unique fournit une idempotence explicite.
-- ---------------------------------------------------------------------------
alter table public.escrow_events
  add column if not exists provider_event_id text;

create unique index if not exists uq_escrow_events_provider_event_id
  on public.escrow_events(provider_event_id)
  where provider_event_id is not null;

-- ---------------------------------------------------------------------------
-- Machine d'etats escrow, source unique de verite.
-- Difference avec la table du webhook : `disputed -> released` est RETIRE.
-- Un litige se solde par un remboursement ou par une decision d'arbitrage
-- explicite (fonction dediee, tracee), jamais par un simple evenement PSP.
-- ---------------------------------------------------------------------------
create or replace function public._escrow_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path to 'public'
as $$
  select case p_from
    when 'created'            then p_to in ('funded','cancelled')
    when 'funded'             then p_to in ('inspection_passed','disputed','refunded','cancelled')
    when 'inspection_passed'  then p_to in ('delivered','disputed','refunded')
    when 'delivered'          then p_to in ('released','disputed')
    -- Un litige ne peut PAS se solder en liberation directe (MG-H08).
    when 'disputed'           then p_to in ('refunded')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Verification des conditions de liberation.
-- `release_conditions` vaut par defaut {"delivery": true, "inspection": true} :
-- ces conditions etaient declarees mais jamais evaluees.
-- ---------------------------------------------------------------------------
create or replace function public._escrow_release_conditions_met(p_escrow_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_tx public.escrow_transactions%rowtype;
  v_cond jsonb;
  v_case uuid;
begin
  select * into v_tx from public.escrow_transactions where id = p_escrow_id;
  if not found then return false; end if;

  v_cond := coalesce(v_tx.release_conditions, '{}'::jsonb);
  v_case := v_tx.transaction_case_id;

  -- Condition "inspection" : une preuve d'etat doit exister au dossier.
  -- En regime certifie, une inspection tierce aboutie ; en regime declaratif,
  -- une declaration vendeur avec preuve (cf. P7d).
  if coalesce((v_cond->>'inspection')::boolean, false) then
    if not exists (
      select 1 from public.inspection_requests
       where transaction_case_id = v_case and status = 'completed'
    ) and not exists (
      select 1 from public.inspection_reports
       where transaction_case_id = v_case and evidence_url is not null
    ) then
      return false;
    end if;
  end if;

  -- Condition "delivery" : la livraison doit etre confirmee.
  if coalesce((v_cond->>'delivery')::boolean, false) then
    if not exists (
      select 1 from public.transport_requests
       where transaction_case_id = v_case and status = 'delivered'
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC unique d'application d'un evenement PSP.
-- Appelee par escrow-webhook APRES verification de signature.
-- Reserve au service_role : jamais joignable par un client.
-- ---------------------------------------------------------------------------
create or replace function public.apply_escrow_event(
  p_escrow_id uuid,
  p_event_type text,
  p_provider_event_id text,
  p_amount numeric default null,
  p_currency text default null,
  p_buyer_id uuid default null,
  p_seller_id uuid default null,
  p_provider_ref text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_tx public.escrow_transactions%rowtype;
  v_target text;
  v_updated int;
begin
  -- Idempotence explicite : un evenement deja traite ne l'est jamais deux fois.
  if p_provider_event_id is not null and exists (
    select 1 from public.escrow_events where provider_event_id = p_provider_event_id
  ) then
    return jsonb_build_object('received', true, 'idempotent', true,
                              'reason', 'event_already_processed');
  end if;

  v_target := case p_event_type
    when 'funded'             then 'funded'
    when 'inspection_passed'  then 'inspection_passed'
    when 'delivery_confirmed' then 'delivered'
    when 'released'           then 'released'
    when 'refunded'           then 'refunded'
    when 'dispute_opened'     then 'disputed'
    when 'cancelled'          then 'cancelled'
    else null
  end;
  if v_target is null then
    raise exception 'unknown_event_type: %', p_event_type;
  end if;

  -- Verrou pessimiste : serialise les livraisons concurrentes du PSP.
  select * into v_tx from public.escrow_transactions
   where id = p_escrow_id for update;
  if not found then raise exception 'escrow_not_found'; end if;

  -- ---- RECONCILIATION FINANCIERE (le coeur de MG-H08) ---------------------
  -- Un evenement signe mais incoherent avec le dossier est refuse.
  if p_amount is not null and v_tx.amount is not null
     and p_amount <> v_tx.amount then
    raise exception 'amount_mismatch: evenement=% escrow=%', p_amount, v_tx.amount;
  end if;

  if p_currency is not null and v_tx.currency is not null
     and upper(p_currency) <> upper(v_tx.currency) then
    raise exception 'currency_mismatch: evenement=% escrow=%', p_currency, v_tx.currency;
  end if;

  if p_buyer_id is not null and v_tx.buyer_id is not null
     and p_buyer_id <> v_tx.buyer_id then
    raise exception 'buyer_mismatch';
  end if;

  if p_seller_id is not null and v_tx.seller_id is not null
     and p_seller_id <> v_tx.seller_id then
    raise exception 'seller_mismatch';
  end if;

  -- Idempotence sur l'etat : deja a l'etat cible, rien a rejouer.
  if v_tx.status = v_target then
    return jsonb_build_object('received', true, 'idempotent', true);
  end if;

  -- ---- TRANSITION LEGALE --------------------------------------------------
  if not public._escrow_transition_allowed(v_tx.status, v_target) then
    raise exception 'illegal_transition: % -> %', v_tx.status, v_target;
  end if;

  -- ---- CONDITIONS DE LIBERATION ------------------------------------------
  if v_target = 'released'
     and not public._escrow_release_conditions_met(p_escrow_id) then
    raise exception 'release_conditions_not_met';
  end if;

  update public.escrow_transactions
     set status = v_target,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         updated_at = now()
   where id = p_escrow_id and status = v_tx.status;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('received', true, 'idempotent', true,
                              'reason', 'concurrent_advance');
  end if;

  insert into public.escrow_events
    (escrow_id, event_type, payload, provider_event_id)
  values (p_escrow_id, p_event_type, coalesce(p_payload,'{}'::jsonb), p_provider_event_id);

  -- Journal transactionnel : provenance 'provider', jamais falsifiable client.
  if v_tx.transaction_case_id is not null then
    insert into public.transaction_events
      (case_id, actor_user_id, event_type, payload, provenance)
    values (v_tx.transaction_case_id, null, 'escrow.' || v_target,
            jsonb_build_object('escrow_id', p_escrow_id,
                               'provider_event_id', p_provider_event_id),
            'provider');
  end if;

  return jsonb_build_object('received', true, 'status', v_target);
end;
$$;

-- Jamais accessible a un client : seul le webhook (service_role) l'appelle.
revoke all on function public.apply_escrow_event(uuid, text, text, numeric, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_escrow_event(uuid, text, text, numeric, text, uuid, uuid, text, jsonb)
  to service_role;

comment on function public.apply_escrow_event(uuid, text, text, numeric, text, uuid, uuid, text, jsonb) is
  'Point d''entree unique des evenements PSP escrow. Reconcilie montant/devise/parties, impose la machine d''etats et les release_conditions (MG-H08). service_role uniquement.';
comment on function public._escrow_transition_allowed(text, text) is
  'Machine d''etats escrow. disputed -> released est INTERDIT : un litige exige un arbitrage explicite (MG-H08).';
