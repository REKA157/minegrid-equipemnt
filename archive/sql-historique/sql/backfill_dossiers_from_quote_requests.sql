-- =====================================================================
-- Rattrapage : crée des dossiers transaction (transaction_cases) pour
-- les quote_requests encore sans transaction_case_id, puis remplit
-- participants + lie la ligne lead.
--
-- Prérequis : transaction_platform_core.sql (+ extended si vous l’utilisez)
-- Exécuter en SQL Editor Supabase avec un rôle ayant les droits (souvent postgres).
--
-- Limite métier identique au front : impossible de lier un acheteur Auth
-- si buyer_user_id est NULL sur quote_requests (formulaire envoyé sans session).
-- =====================================================================

-- --- Aperçu : leads sans dossier, avec acheteur identifié en base
select
  qr.id,
  qr.machine_id,
  qr.buyer_email,
  qr.buyer_user_id,
  qr.seller_id,
  qr.transaction_case_id
from public.quote_requests qr
where qr.transaction_case_id is null
  and qr.buyer_user_id is not null
  and qr.seller_id is not null
  and qr.buyer_user_id is distinct from qr.seller_id
  and qr.seller_id not in (
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

-- --- Rattrapage (transaction + mise à jour quote_requests + participants)
begin;

with ins as (
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
  select
    'sale',
    'draft',
    qr.machine_id,
    qr.seller_id,
    qr.buyer_user_id,
    qr.id,
    'Demande de devis (rattrapage)',
    qr.buyer_user_id
  from public.quote_requests qr
  where qr.transaction_case_id is null
    and qr.buyer_user_id is not null
    and qr.seller_id is not null
    and qr.buyer_user_id is distinct from qr.seller_id
    and qr.seller_id not in (
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    )
  returning id, seller_user_id, buyer_user_id, primary_quote_request_id
),
upd as (
  update public.quote_requests qr
  set
    transaction_case_id = ins.id,
    updated_at = now()
  from ins
  where qr.id = ins.primary_quote_request_id
  returning qr.id
)
insert into public.transaction_participants (
  case_id,
  user_id,
  role,
  invited_by,
  invited_at
)
select ins.id, ins.buyer_user_id, 'buyer', ins.buyer_user_id, now()
from ins
union all
select ins.id, ins.seller_user_id, 'seller', ins.buyer_user_id, now()
from ins;

commit;

-- --- Contrôle
select id, buyer_email, seller_id, buyer_user_id, transaction_case_id
from public.quote_requests
where lower(trim(buyer_email)) = lower(trim('t.ainour@ads-idf.fr'))
order by created_at desc;
