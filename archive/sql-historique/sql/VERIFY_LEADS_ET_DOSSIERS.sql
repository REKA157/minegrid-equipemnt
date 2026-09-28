-- =====================================================================
-- Diagnostic : leads vs dossiers transaction (quote_requests ↔ transaction_cases)
-- À exécuter dans Supabase SQL Editor (rôle postgres / lecture totale sans RLS).
--
-- Déploiement recommandé (ordre minimal si tables déjà créées) :
--   1) transaction_platform_core.sql (+ patch_transaction_participants_insert_buyer.sql si INSERT participants refusé)
--   2) quote_requests.sql ou patch_quote_requests_and_leads.sql
--   3) transaction_platform_extended.sql si besoin
--   4) transaction_platform_links_and_triggers.sql  — ou bien :
--          patch_transaction_cases_link_quote_trigger.sql
--          + rpc_ensure_transaction_case_for_quote_request.sql (grant inclus)
--
-- Cause fréquente « leads OK, dossiers vides » : quote_requests sans buyer_user_id
-- (visitant non connecté) → aucun dossier ; ou seller_id NULL + ancien trigger
-- qui rollback l’INSERT dossier avant correctif liaison quote.
-- =====================================================================

-- A. Synthèse 7 derniers jours : quote sans dossier alors qu’acheteur identifié
select
  count(*) filter (where buyer_user_id is null) as quotes_sans_acheteur_connecte,
  count(*) filter (where buyer_user_id is not null and transaction_case_id is null) as quotes_avec_acheteur_sans_dossier,
  count(*) filter (where transaction_case_id is not null) as quotes_avec_dossier
from public.quote_requests
where created_at > now() - interval '7 days';

-- B. Détail récent des demandes problématiques (acheteur renseigné mais pas de dossier)
select
  id,
  created_at,
  machine_id,
  seller_id,
  buyer_user_id,
  transaction_case_id,
  buyer_email
from public.quote_requests
where buyer_user_id is not null
  and transaction_case_id is null
order by created_at desc
limit 25;

-- C. Dossiers orphelins (rare) : case pointe une quote ou absente côté quote
select c.id, c.created_at, c.primary_quote_request_id, c.seller_user_id, c.buyer_user_id
from public.transaction_cases c
where c.primary_quote_request_id is not null
  and not exists (
    select 1 from public.quote_requests q
    where q.id = c.primary_quote_request_id
  )
order by c.created_at desc
limit 10;

-- D. Présence des objets côté base
select proname, prosecdef
from pg_proc
where proname in (
  'transaction_cases_after_insert_link_quote_request',
  'ensure_transaction_case_for_quote_request'
);

select tgname
from pg_trigger
where tgname = 'trg_transaction_cases_link_quote_request';

-- E. Diagnostic liaison trigger : meme erreur « impossible de lier » — comparer quote vs dossier (adapter les UUID)
select
  qr.id as quote_id,
  qr.machine_id as q_machine,
  qr.seller_id as q_seller,
  qr.buyer_user_id as q_buyer,
  qr.transaction_case_id as q_linked,
  tc.id as case_id,
  tc.machine_id as c_machine,
  tc.seller_user_id as c_seller,
  tc.buyer_user_id as c_buyer,
  tc.primary_quote_request_id,
  (qr.seller_id is not distinct from tc.seller_user_id) as sellers_align,
  (qr.machine_id is not distinct from tc.machine_id) as machines_align
from public.quote_requests qr
cross join public.transaction_cases tc
where qr.id = '127b3477-2559-4deb-88b5-60432b85466f'::uuid
  and tc.id = '5118a984-1668-4207-9340-6cff8f4e79ee'::uuid;
