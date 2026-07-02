-- =====================================================================
-- PONT ESCROW — relier payment_records (dossier) <-> escrow_transactions (PSP)
-- =====================================================================
-- PROBLÈME (audit 2026-06) : deux systèmes d'escrow réels mais DÉCONNECTÉS.
--   • Système A : escrow_transactions (sql/nextgen/0002) = ARGENT RÉEL via PSP,
--     écrit uniquement par escrow-webhook (service_role), alimente le trust score
--     (recompute-trust-score lit escrow_transactions.status released/disputed).
--     Mais il IGNORE le dossier (pas de transaction_case_id).
--   • Système B : payment_records (transaction_platform_extended) = MIROIR du
--     dossier (transaction_case_id), mais ne touche JAMAIS d'argent (awaiting_partner).
--
-- CE PONT : escrow_transactions reste la SOURCE DE VÉRITÉ de l'argent ; payment_records
-- en devient le MIROIR au niveau dossier. On NE SIMULE AUCUN PAIEMENT : la propagation
-- ne fait que refléter l'état réel posé par le PSP (escrow-webhook). 'created' = escrow
-- ouvert mais NON financé (aucun argent).
--
-- SÉCURITÉ : propagation par trigger SECURITY DEFINER (serveur) ; le RPC de liaison
-- vérifie que l'appelant est partie prenante des DEUX objets ; idempotent ; journalisé
-- dans transaction_events. RLS inchangée (escrow reste service_role only en écriture).
--
-- Idempotent (add column if not exists, create or replace). Pré-requis :
-- sql/nextgen/0002_escrow_and_finance.sql + sql/transaction_platform_extended.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) LIENS bidirectionnels (colonnes nullables = compat totale avec l'existant)
-- ---------------------------------------------------------------------
alter table public.escrow_transactions
  add column if not exists transaction_case_id uuid
  references public.transaction_cases (id) on delete set null;

create index if not exists escrow_transactions_case_idx
  on public.escrow_transactions (transaction_case_id)
  where transaction_case_id is not null;

alter table public.payment_records
  add column if not exists escrow_transaction_id uuid
  references public.escrow_transactions (id) on delete set null;

create index if not exists payment_records_escrow_link_idx
  on public.payment_records (escrow_transaction_id)
  where escrow_transaction_id is not null;

-- ---------------------------------------------------------------------
-- 2) MAPPING d'état : escrow_transactions.status -> payment_records.status
--    Fidèle à l'état réel de l'argent. 'created' = ouvert non financé.
-- ---------------------------------------------------------------------
create or replace function public._escrow_status_to_payment(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'created'           then 'awaiting_partner'  -- escrow ouvert, AUCUN argent
    when 'funded'            then 'held'               -- fonds séquestrés chez le PSP
    when 'inspection_passed' then 'held'
    when 'delivered'         then 'held'
    when 'released'          then 'released'           -- terminal : payé au vendeur
    when 'refunded'          then 'refunded'           -- terminal : remboursé
    when 'disputed'          then 'disputed'
    when 'cancelled'         then 'cancelled'
    else 'pending'
  end;
$$;

-- ---------------------------------------------------------------------
-- 3) PROPAGATION A -> B : à chaque (in)mutation d'un escrow rattaché à un
--    dossier, le payment_records miroir reflète l'état réel + event d'audit.
-- ---------------------------------------------------------------------
create or replace function public._tc_sync_payment_from_escrow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
  v_existing_id uuid;
  v_existing_status text;
begin
  -- Escrow non rattaché à un dossier -> rien à miroiter.
  if new.transaction_case_id is null then
    return new;
  end if;

  v_payment_status := public._escrow_status_to_payment(new.status);

  -- Ligne escrow OUVERTE du dossier (créée par create_payment_step) ou déjà liée.
  select id, status into v_existing_id, v_existing_status
  from public.payment_records
  where transaction_case_id = new.transaction_case_id
    and payment_type = 'escrow'
    and (escrow_transaction_id = new.id
         or status not in ('released', 'refunded', 'cancelled'))
  order by (escrow_transaction_id = new.id) desc, created_at desc
  limit 1;

  if v_existing_id is not null then
    -- Idempotence : déjà à l'état cible ET déjà liée -> aucun bruit.
    if v_existing_status is distinct from v_payment_status
       or not exists (
         select 1 from public.payment_records
         where id = v_existing_id and escrow_transaction_id = new.id
       ) then
      update public.payment_records
         set status = v_payment_status, escrow_transaction_id = new.id
       where id = v_existing_id;

      insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
      values (new.transaction_case_id, null, 'escrow.synced',
        jsonb_build_object('escrow_id', new.id, 'escrow_status', new.status,
                           'payment_status', v_payment_status, 'payment_record_id', v_existing_id));
    end if;
  else
    -- Aucune ligne dossier : on crée le miroir (montant/devise = ceux de l'escrow réel).
    insert into public.payment_records
      (transaction_case_id, payer_id, payee_id, amount, currency, payment_type, status, escrow_transaction_id)
    values
      (new.transaction_case_id, new.buyer_id, new.seller_id, new.amount,
       coalesce(new.currency, 'MAD'), 'escrow', v_payment_status, new.id)
    returning id into v_existing_id;

    insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
    values (new.transaction_case_id, null, 'escrow.synced',
      jsonb_build_object('escrow_id', new.id, 'escrow_status', new.status,
                         'payment_status', v_payment_status, 'payment_record_id', v_existing_id, 'created', true));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_escrow_sync_payment on public.escrow_transactions;
create trigger trg_escrow_sync_payment
  after insert or update of status, transaction_case_id on public.escrow_transactions
  for each row execute function public._tc_sync_payment_from_escrow();

-- ---------------------------------------------------------------------
-- 4) RPC link_case_to_escrow : rattacher un escrow RÉEL existant à un dossier.
--    Ne déplace aucun argent ; le trigger synchronise ensuite le miroir.
-- ---------------------------------------------------------------------
create or replace function public.link_case_to_escrow(p_case_id uuid, p_escrow_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_escrow public.escrow_transactions%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public._tc_is_party(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  select * into v_escrow from public.escrow_transactions where id = p_escrow_id;
  if not found then raise exception 'escrow_not_found'; end if;

  -- L'appelant doit aussi être partie de l'escrow (acheteur ou vendeur).
  if v_escrow.buyer_id <> v_uid and v_escrow.seller_id <> v_uid then
    raise exception 'forbidden';
  end if;

  -- Idempotent : déjà lié au même dossier -> on ressort.
  if v_escrow.transaction_case_id is not distinct from p_case_id then
    return p_escrow_id;
  end if;
  if v_escrow.transaction_case_id is not null then
    raise exception 'escrow_already_linked';
  end if;

  update public.escrow_transactions
     set transaction_case_id = p_case_id, updated_at = now()
   where id = p_escrow_id;  -- déclenche trg_escrow_sync_payment

  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (p_case_id, v_uid, 'escrow.linked',
    jsonb_build_object('escrow_id', p_escrow_id, 'escrow_status', v_escrow.status));

  return p_escrow_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC open_case_escrow : ouvrir un escrow (status 'created' = NON financé)
--    pour un dossier. AUCUN paiement : juste l'ouverture du séquestre côté PSP
--    à venir. Le financement réel arrivera par escrow-webhook (PSP signé).
-- ---------------------------------------------------------------------
create or replace function public.open_case_escrow(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_case from public.transaction_cases where id = p_case_id;
  if not found then raise exception 'case not found'; end if;

  -- Seuls les principaux (vendeur/acheteur) ouvrent un escrow.
  if v_case.seller_user_id <> v_uid and v_case.buyer_user_id is distinct from v_uid then
    raise exception 'forbidden';
  end if;

  -- Anti-façade : pas d'escrow sans acheteur réel ni montant.
  if v_case.buyer_user_id is null then raise exception 'buyer_required'; end if;

  -- Filet : si le dossier n'a pas de montant (anciens dossiers), le renseigner
  -- depuis le prix de l'annonce (machines.price est en TEXT → parsing défensif).
  if coalesce(v_case.total_amount, 0) <= 0 and v_case.machine_id is not null then
    update public.transaction_cases
       set total_amount = (
             select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric
             from public.machines m where m.id = v_case.machine_id limit 1),
           currency = coalesce(v_case.currency, 'MAD')
     where id = p_case_id and (total_amount is null or total_amount <= 0);
    select * into v_case from public.transaction_cases where id = p_case_id;
  end if;

  if coalesce(v_case.total_amount, 0) <= 0 then raise exception 'amount_required'; end if;

  -- Idempotence : un escrow non terminal déjà rattaché -> on le renvoie.
  select id into v_existing from public.escrow_transactions
   where transaction_case_id = p_case_id
     and status not in ('released', 'refunded', 'cancelled')
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  if v_case.machine_id is null then raise exception 'machine_required'; end if;

  insert into public.escrow_transactions
    (machine_id, buyer_id, seller_id, amount, currency, status, transaction_case_id)
  values
    (v_case.machine_id, v_case.buyer_user_id, v_case.seller_user_id,
     v_case.total_amount, coalesce(v_case.currency, 'MAD'), 'created', p_case_id)
  returning id into v_id;  -- déclenche trg_escrow_sync_payment (miroir payment_records)

  insert into public.escrow_events (escrow_id, event_type, actor_id, payload)
  values (v_id, 'opened', v_uid, jsonb_build_object('transaction_case_id', p_case_id, 'note', 'escrow ouvert, non finance'));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Grants — RPC réservées aux authentifiés (contrôles DANS les fonctions).
--    Les écritures directes sur escrow_transactions restent révoquées (0002).
-- ---------------------------------------------------------------------
grant execute on function public.link_case_to_escrow(uuid, uuid) to authenticated;
grant execute on function public.open_case_escrow(uuid) to authenticated;

-- Vérification :
-- select proname from pg_proc where proname in ('link_case_to_escrow','open_case_escrow','_tc_sync_payment_from_escrow','_escrow_status_to_payment');
