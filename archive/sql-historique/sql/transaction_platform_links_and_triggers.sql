/*
  Extensions fichier 2 : lier les tables metiers au dossier + automation basique.
  Executer APRES : transaction_platform_core.sql, quote_requests.sql, pipeline_leads.sql,
  et les deploy_* concernes (colonnes optionnelles si table absente).
*/

-- -------------------- colonnes transaction_case_id (nullable) --------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    -- FK nommee : pipeline_leads.sql / patch_quote_requests_and_leads.sql (evite double contrainte)
    alter table public.leads add column if not exists transaction_case_id uuid;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'credit_applications') then
    alter table public.credit_applications add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'insurance_policies') then
    alter table public.insurance_policies add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'deliveries') then
    alter table public.deliveries add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interventions') then
    alter table public.interventions add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'repairs') then
    alter table public.repairs add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customs_declarations') then
    alter table public.customs_declarations add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'freight_containers') then
    alter table public.freight_containers add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'logistics_route_tracking') then
    alter table public.logistics_route_tracking add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'investments') then
    alter table public.investments add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rentals') then
    alter table public.rentals add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'broker_clients') then
    alter table public.broker_clients add column if not exists transaction_case_id uuid references public.transaction_cases (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    execute 'create index if not exists leads_transaction_case_idx on public.leads (transaction_case_id) where transaction_case_id is not null';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'credit_applications') then
    execute 'create index if not exists credit_applications_transaction_case_idx on public.credit_applications (transaction_case_id) where transaction_case_id is not null';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'deliveries') then
    execute 'create index if not exists deliveries_transaction_case_idx on public.deliveries (transaction_case_id) where transaction_case_id is not null';
  end if;
end $$;

-- -------------------- 1 lead Kanban par demande de devis (idempotent) --------------------
create or replace function public.quote_requests_after_insert_sync_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seller_id is null then
    return new;
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    return new;
  end if;
  if exists (select 1 from public.leads l where l.quote_request_id = new.id) then
    return new;
  end if;

  insert into public.leads (
    seller_id, title, stage, priority, value, probability,
    next_action, assigned_to, last_contact, notes,
    contact_name, contact_phone, contact_email,
    source, source_id, machine_id, quote_request_id, buyer_user_id, transaction_case_id
  ) values (
    new.seller_id,
    left('Demande : ' || coalesce(new.machine_name, 'Machine'), 300),
    'Prospection',
    'high',
    coalesce(new.budget_max, new.budget_min, 0),
    30,
    'Repondre a la demande (inbox devis)',
    'Vendeur',
    now(),
    nullif(trim(coalesce(new.message, '')), ''),
    new.buyer_name,
    new.buyer_phone,
    new.buyer_email,
    'quote_request',
    new.id::text,
    new.machine_id,
    new.id,
    new.buyer_user_id,
    new.transaction_case_id
  );
  return new;
exception
  when others then
    raise warning 'quote_requests_sync_lead: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_quote_requests_sync_lead on public.quote_requests;
create trigger trg_quote_requests_sync_lead
  after insert on public.quote_requests
  for each row execute function public.quote_requests_after_insert_sync_lead();

-- Mettre a jour le lead quand le dossier est rattache apres coup
create or replace function public.quote_requests_after_update_sync_lead_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_case_id is distinct from old.transaction_case_id
     and new.transaction_case_id is not null
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leads') then
    update public.leads
    set transaction_case_id = new.transaction_case_id, updated_at = now()
    where quote_request_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quote_requests_update_lead_case on public.quote_requests;
create trigger trg_quote_requests_update_lead_case
  after update of transaction_case_id on public.quote_requests
  for each row execute function public.quote_requests_after_update_sync_lead_case();

-- -------------------- Audit : creation dossier --------------------
create or replace function public.transaction_cases_after_insert_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transaction_events') then
    return new;
  end if;
  insert into public.transaction_events (case_id, actor_user_id, event_type, payload)
  values (
    new.id,
    coalesce(new.created_by, new.buyer_user_id, new.seller_user_id),
    'case.created',
    jsonb_build_object('kind', new.kind, 'status', new.status, 'machine_id', new.machine_id)
  );
  return new;
exception
  when others then
    raise warning 'transaction_cases_audit: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_transaction_cases_audit on public.transaction_cases;
create trigger trg_transaction_cases_audit
  after insert on public.transaction_cases
  for each row execute function public.transaction_cases_after_insert_audit();

-- -------------------- Liaison quote_requests.transaction_case_id (fail-safe RLS) --------------------
-- L UPDATE client depuis le navigateur peut etre refuse par RLS selon les policies ;
-- ce trigger SECURITY DEFINER assure la coherence dossier <-> demande de devis quand
-- primary_quote_request_id est renseigne sur le dossier.
create or replace function public.transaction_cases_after_insert_link_quote_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if new.primary_quote_request_id is null then
    return new;
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'quote_requests'
  ) then
    return new;
  end if;

  /*
    Vendeur aligne OU meme machine que le dossier (corrige seller_id obsolete sur quote).
    Pas de contrainte acheteur : la ligne est par definition celle du dossier (meme id quote).
  */
  update public.quote_requests qr
  set
    transaction_case_id = new.id,
    seller_id = coalesce(qr.seller_id, new.seller_user_id),
    updated_at = now()
  where qr.id = new.primary_quote_request_id
    and qr.transaction_case_id is null
    and (
      qr.seller_id is not distinct from new.seller_user_id
      or qr.machine_id is not distinct from new.machine_id
    );

  get diagnostics n = row_count;
  if n = 0 then
    raise exception
      'transaction_cases_link_quote_request: impossible de lier quote_request % au dossier % (introuvable, vendeur/machine incoherent avec la quote, ou deja liee)',
      new.primary_quote_request_id,
      new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_cases_link_quote_request on public.transaction_cases;
create trigger trg_transaction_cases_link_quote_request
  after insert on public.transaction_cases
  for each row execute function public.transaction_cases_after_insert_link_quote_request();

-- =====================================================================
-- [DEPRECATED / SUPERSEDED] Ancienne definition SANS total_amount.
-- La version CANONIQUE vit dans :
--   supabase/migrations/20260702090000_p2_consolidate_critical_functions.sql
--   (et sql/rpc_ensure_transaction_case_for_quote_request.sql).
-- Fonction renommee `__superseded` pour NE PLUS ecraser la canonique si ce
-- fichier est re-execute. NE PAS re-executer ce fichier : les migrations sont
-- la source de verite (voir supabase/migrations/README.md).
-- =====================================================================

create or replace function public.ensure_transaction_case_for_quote_request__superseded(p_quote_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  qr record;
  new_case uuid;
  resolved_seller uuid;
begin
  if auth.uid() is null then
    raise exception 'ensure_transaction_case_for_quote_request: authentification requise';
  end if;

  select *
  into qr
  from public.quote_requests
  where id = p_quote_request_id;

  if not found then
    raise exception 'ensure_transaction_case_for_quote_request: quote_request introuvable';
  end if;

  resolved_seller := qr.seller_id;
  if resolved_seller is null
     and qr.machine_id is not null
     and exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'machines'
     ) then
    select coalesce(m.seller_id, m.sellerid, m.user_id, m.owner_id)
    into resolved_seller
    from public.machines m
    where m.id = qr.machine_id
    limit 1;
  end if;

  if auth.uid() is distinct from qr.buyer_user_id
     and auth.uid() is distinct from resolved_seller then
    raise exception 'ensure_transaction_case_for_quote_request: accès refusé';
  end if;

  if qr.transaction_case_id is not null then
    return qr.transaction_case_id;
  end if;

  if resolved_seller is null or qr.buyer_user_id is null then
    return null;
  end if;

  if qr.buyer_user_id = resolved_seller then
    return null;
  end if;

  update public.quote_requests q0
  set seller_id = resolved_seller, updated_at = now()
  where q0.id = qr.id
    and q0.seller_id is distinct from resolved_seller;

  insert into public.transaction_cases (
    kind,
    status,
    machine_id,
    seller_user_id,
    buyer_user_id,
    primary_quote_request_id,
    title,
    created_by
  )
  values (
    'sale',
    'draft',
    qr.machine_id,
    resolved_seller,
    qr.buyer_user_id,
    qr.id,
    'Demande depuis annonce',
    qr.buyer_user_id
  )
  returning id into new_case;

  insert into public.transaction_participants (
    case_id,
    user_id,
    role,
    invited_by,
    invited_at
  )
  values
    (new_case, qr.buyer_user_id, 'buyer', qr.buyer_user_id, now()),
    (new_case, resolved_seller, 'seller', qr.buyer_user_id, now());

  update public.quote_requests q
  set
    transaction_case_id = new_case,
    seller_id = coalesce(q.seller_id, resolved_seller),
    updated_at = now()
  where q.id = qr.id and q.transaction_case_id is null;

  return new_case;
end;
$$;

grant execute on function public.ensure_transaction_case_for_quote_request__superseded(uuid) to authenticated;
