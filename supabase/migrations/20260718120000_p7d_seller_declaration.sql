-- ============================================================================
-- P7d - Voie declarative vendeur (diagnostic video a distance)
-- ============================================================================
-- CONTEXTE METIER
--   La verification d'etat d'un materiel d'occasion sur MineGrid repose sur un
--   diagnostic video a distance fourni par le PROPRIETAIRE/VENDEUR. C'est une
--   preuve DECLARATIVE versee au dossier, pas une inspection independante.
--
-- PROBLEME
--   P7b (correctif MG-H07) exige desormais un mecanicien assigne et distinct
--   des principals. Applique seul, il bloquerait le parcours reel : un dossier
--   sans inspecteur assigne leve `inspection_not_assigned`.
--   Mais lever cette exigence rouvrirait MG-H07 : un vendeur certifiant sa
--   propre machine, avec un rapport indistinguable d'une inspection tierce.
--
-- SOLUTION
--   Deux voies SEPAREES, jamais confondues :
--     1. complete_inspection_step   -> inspection CERTIFIEE, inspecteur tiers
--        assigne (inchangee, cf. P7b).
--     2. submit_seller_declaration  -> preuve DECLARATIVE du vendeur, tracee
--        comme telle, sans valeur certifiante.
--
--   Le vendeur peut donc alimenter son dossier, mais sa declaration :
--     - est marquee `evidence_type = 'seller_declaration'` et `certified = false`;
--     - ne peut PAS porter de `mechanic_id` (aucune usurpation d'inspecteur);
--     - ne fait pas passer la demande d'inspection a 'completed' : elle reste
--       ouverte tant qu'aucun tiers n'a certifie;
--     - n'alimente aucun score de confiance.
--
--   L'invariant conserve est celui qui compte commercialement : sur MineGrid,
--   "certifie" ne peut jamais signifier "auto-declare".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tracabilite de la nature de la preuve.
-- ---------------------------------------------------------------------------
alter table public.inspection_reports
  add column if not exists evidence_type text not null default 'certified_inspection';

alter table public.inspection_reports
  add column if not exists certified boolean not null default true;

alter table public.inspection_reports
  add column if not exists declared_by uuid references auth.users(id);

alter table public.inspection_reports
  add column if not exists evidence_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_reports'::regclass
      and conname  = 'inspection_reports_evidence_type_check'
  ) then
    begin
      alter table public.inspection_reports
        add constraint inspection_reports_evidence_type_check
        check (evidence_type in ('certified_inspection','seller_declaration'));
    exception when others then
      raise notice 'contrainte evidence_type non appliquee: %', sqlerrm;
    end;
  end if;

  -- INVARIANT CENTRAL : une declaration vendeur ne peut jamais etre certifiee,
  -- ni porter de mecanicien. Verrouille au niveau du schema, donc valable meme
  -- si une ecriture contourne les RPC.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_reports'::regclass
      and conname  = 'inspection_reports_declaration_not_certified'
  ) then
    begin
      alter table public.inspection_reports
        add constraint inspection_reports_declaration_not_certified
        check (
          evidence_type <> 'seller_declaration'
          or (certified = false and mechanic_id is null)
        );
    exception when others then
      raise notice 'contrainte declaration non appliquee: %', sqlerrm;
    end;
  end if;

  -- Symetrique : une inspection certifiee DOIT porter son inspecteur.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inspection_reports'::regclass
      and conname  = 'inspection_reports_certified_needs_mechanic'
  ) then
    begin
      alter table public.inspection_reports
        add constraint inspection_reports_certified_needs_mechanic
        check (certified = false or mechanic_id is not null);
    exception when others then
      raise notice 'contrainte certification non appliquee: %', sqlerrm;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RPC : soumission d'une declaration vendeur.
-- Autorisee au VENDEUR du dossier uniquement (c'est lui qui detient la machine).
-- ---------------------------------------------------------------------------
create or replace function public.submit_seller_declaration(
  p_case_id uuid,
  p_evidence_url text,
  p_condition_score integer default null,
  p_summary text default null,
  p_recommendations text default null
)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_insp public.inspection_requests%rowtype;
  v_report_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if p_evidence_url is null or length(trim(p_evidence_url)) = 0 then
    raise exception 'evidence_required: le diagnostic video est obligatoire';
  end if;

  -- Meme borne que la voie certifiee : un score declaratif reste un score.
  if p_condition_score is not null
     and (p_condition_score < 0 or p_condition_score > 100) then
    raise exception 'invalid_condition_score: % (attendu 0-100)', p_condition_score;
  end if;

  select * into v_case from public.transaction_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status in ('closed','cancelled') then
    raise exception 'case_terminal_state: %', v_case.status;
  end if;

  -- Seul le VENDEUR declare l'etat de sa machine.
  if v_case.seller_user_id is distinct from v_uid then
    raise exception 'forbidden: seul le vendeur peut deposer une declaration';
  end if;

  select * into v_insp from public.inspection_requests
   where transaction_case_id = p_case_id
   order by created_at desc limit 1;
  if not found then raise exception 'inspection_not_found'; end if;

  -- La demande d'inspection N'EST PAS marquee 'completed' : une declaration ne
  -- clot pas l'etape. Elle reste ouverte pour une eventuelle certification tierce.
  insert into public.inspection_reports
    (inspection_request_id, transaction_case_id, mechanic_id,
     condition_score, summary, recommendations,
     evidence_type, certified, declared_by, evidence_url)
  values (v_insp.id, p_case_id, null,
          p_condition_score, p_summary, p_recommendations,
          'seller_declaration', false, v_uid, p_evidence_url)
  returning id into v_report_id;

  insert into public.transaction_events
    (case_id, actor_user_id, event_type, payload, provenance)
  values (p_case_id, v_uid, 'inspection.declared',
          jsonb_build_object('report_id', v_report_id, 'certified', false),
          'system');

  return v_report_id;
end;
$$;

grant execute on function public.submit_seller_declaration(uuid, text, integer, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Cloture : une declaration vendeur NE SUFFIT PAS a considerer l'inspection
-- aboutie... sauf si le dossier assume explicitement le mode declaratif.
-- Le drapeau est porte par le dossier, pas par l'utilisateur : l'acheteur voit
-- donc, au niveau du dossier, quel regime de preuve s'applique.
-- ---------------------------------------------------------------------------
alter table public.transaction_cases
  add column if not exists evidence_regime text not null default 'declarative';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transaction_cases'::regclass
      and conname  = 'transaction_cases_evidence_regime_check'
  ) then
    begin
      alter table public.transaction_cases
        add constraint transaction_cases_evidence_regime_check
        check (evidence_regime in ('declarative','certified'));
    exception when others then
      raise notice 'contrainte evidence_regime non appliquee: %', sqlerrm;
    end;
  end if;
end
$$;

create or replace function public.close_transaction_case(p_case_id uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.transaction_cases%rowtype;
  v_has_evidence boolean;
  v_escrow_blocking text;
  v_payment_blocking text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_case from public.transaction_cases where id = p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status = 'closed' then return p_case_id; end if;
  if v_case.status = 'cancelled' then raise exception 'case_cancelled'; end if;
  if not public._tc_is_principal(p_case_id, v_uid) then raise exception 'forbidden'; end if;

  -- PRECONDITION POSITIVE, adaptee au regime de preuve du dossier.
  if v_case.evidence_regime = 'certified' then
    -- Regime certifie : seule une inspection tierce aboutie compte.
    select exists (
      select 1 from public.inspection_requests
      where transaction_case_id = p_case_id and status = 'completed'
    ) into v_has_evidence;
    if not v_has_evidence then
      raise exception 'empty_case_cannot_close: aucune inspection certifiee';
    end if;
  else
    -- Regime declaratif : une declaration vendeur avec preuve suffit.
    select exists (
      select 1 from public.inspection_reports
      where transaction_case_id = p_case_id
        and evidence_url is not null
    ) or exists (
      select 1 from public.inspection_requests
      where transaction_case_id = p_case_id and status = 'completed'
    ) into v_has_evidence;
    if not v_has_evidence then
      raise exception 'empty_case_cannot_close: aucune preuve d''etat versee';
    end if;
  end if;

  -- Etapes encore ouvertes. En regime declaratif la demande d'inspection reste
  -- volontairement 'requested' : on ne la traite donc pas comme bloquante.
  if v_case.evidence_regime = 'certified' and exists (
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

  insert into public.transaction_events
    (case_id, actor_user_id, event_type, payload, provenance)
  values (p_case_id, v_uid, 'case.closed',
          jsonb_build_object('closed_by', v_uid,
                             'evidence_regime', v_case.evidence_regime),
          'system');

  return p_case_id;
end;
$$;

comment on function public.submit_seller_declaration(uuid, text, integer, text, text) is
  'Preuve declarative du vendeur (diagnostic video). Jamais certifiee, jamais rattachee a un mecanicien (MG-H07 / P7d).';
comment on column public.inspection_reports.certified is
  'false pour une declaration vendeur. "Certifie" ne peut jamais signifier "auto-declare".';
comment on column public.transaction_cases.evidence_regime is
  'Regime de preuve du dossier : declarative (video vendeur) ou certified (inspection tierce).';
