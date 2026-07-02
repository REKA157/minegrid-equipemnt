-- =====================================================================
-- P2 — CONSOLIDATION DES FONCTIONS CRITIQUES (source unique de vérité)
-- =====================================================================
-- Contexte : plusieurs définitions concurrentes du même objet existaient dans
-- sql/ (ex. can_access_transaction_case v1 sans organisation vs v2 org-aware ;
-- ensure_transaction_case_for_quote_request avec/sans total_amount). Ré-appliquer
-- l'ancien fichier écrasait la bonne version -> dérive RLS / escrow cassé.
--
-- Cette migration RÉ-AFFIRME la version CANONIQUE de chaque fonction. Elle est
-- idempotente (CREATE OR REPLACE) et doit être la DERNIÈRE appliquée pour ces 2
-- objets. Les anciennes définitions inline sont marquées « SUPERSEDED » dans
-- leurs fichiers d'origine (voir sql/transaction_platform_links_and_triggers.sql).
--
-- À appliquer via `supabase db push` (ou SQL Editor en dépannage, tracé).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) can_access_transaction_case — CANONIQUE = version org-aware (ex-extended)
--    Accès dossier : vendeur, acheteur, participant actif (non révoqué), OU
--    admin de l'organisation propriétaire du dossier.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_transaction_case(p_case_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_cases c
    WHERE c.id = p_case_id
      AND (c.seller_user_id = p_uid OR c.buyer_user_id = p_uid)
  )
  OR EXISTS (
    SELECT 1 FROM public.transaction_participants p
    WHERE p.case_id = p_case_id AND p.user_id = p_uid AND p.revoked_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.transaction_cases c
    WHERE c.id = p_case_id
      AND c.organization_id IS NOT NULL
      AND public.user_in_org_admin(c.organization_id, p_uid)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_transaction_case(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) ensure_transaction_case_for_quote_request — CANONIQUE (avec total_amount)
--    Renseigne total_amount/currency (prérequis de open_case_escrow) : la version
--    plus ancienne de transaction_platform_links_and_triggers.sql ne le faisait PAS.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_transaction_case_for_quote_request(p_quote_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
declare
  qr record;
  new_case uuid;
  resolved_seller uuid;
  v_amount numeric;
  v_currency text := 'MAD';
begin
  if auth.uid() is null then
    raise exception 'ensure_transaction_case_for_quote_request: authentification requise';
  end if;

  select * into qr from public.quote_requests where id = p_quote_request_id;
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

  -- Montant du dossier : offre acheteur (budget_max sinon budget_min),
  -- repli prix annonce (machines.price est en TEXT -> parsing défensif).
  v_amount := coalesce(qr.budget_max, qr.budget_min);
  if v_amount is null and qr.machine_id is not null then
    select nullif(regexp_replace(replace(m.price::text, ',', '.'), '[^0-9.]', '', 'g'), '')::numeric
      into v_amount
    from public.machines m
    where m.id = qr.machine_id
    limit 1;
  end if;
  if coalesce(v_amount, 0) <= 0 then v_amount := null; end if;

  insert into public.transaction_cases (
    kind, status, machine_id, seller_user_id, buyer_user_id,
    primary_quote_request_id, title, created_by, total_amount, currency
  )
  values (
    'sale', 'draft', qr.machine_id, resolved_seller, qr.buyer_user_id,
    qr.id, 'Demande depuis annonce', qr.buyer_user_id, v_amount, v_currency
  )
  returning id into new_case;

  insert into public.transaction_participants (
    case_id, user_id, role, invited_by, invited_at
  )
  values
    (new_case, qr.buyer_user_id, 'buyer', qr.buyer_user_id, now()),
    (new_case, resolved_seller, 'seller', qr.buyer_user_id, now())
  on conflict (case_id, user_id, role) do nothing;

  update public.quote_requests q
  set transaction_case_id = new_case,
      seller_id = coalesce(q.seller_id, resolved_seller),
      updated_at = now()
  where q.id = qr.id and q.transaction_case_id is null;

  return new_case;
end;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_transaction_case_for_quote_request(uuid) TO authenticated;
