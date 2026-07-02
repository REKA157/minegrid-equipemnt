-- ============================================================
--   DIAGNOSTIC DE VALIDATION — LECTURE SEULE (1 seul résultat)
-- ============================================================
-- Tout en UNE requête -> Supabase affiche un seul tableau (pratique à recopier).
-- Ne modifie RIEN. À lancer dans Supabase > SQL Editor > Run.
--
-- Colonnes : section | element | valeur
--   RLS    -> 'ACTIVE/OFF · N policies'   [point 4]
--   RPC    -> 'SECURITY DEFINER/invoker'  [points 1 & 3]
--   COUNT  -> nb de lignes par table      [point 5]
--   CHAINE -> chaîne du dernier dossier   [point 6]
-- ============================================================

with chain as (
  select id from public.transaction_cases order by created_at desc limit 1
)
select section, element, valeur
from (
  -- (4) RLS active + nb de policies
  select 1 as ord, 'RLS' as section, c.relname as element,
         (case when c.relrowsecurity then 'ACTIVE' else '*** OFF ***' end)
         || ' · '
         || (select count(*) from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname)::text
         || ' policies' as valeur
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('transaction_cases','transaction_participants','transaction_events',
                      'inspection_requests','payment_records','financing_requests',
                      'transport_requests','customs_cases')

  union all
  -- (1 & 3) Fonctions présentes + SECURITY DEFINER
  select 2, 'RPC', proname,
         case when prosecdef then 'SECURITY DEFINER' else 'invoker' end
  from pg_proc
  where proname in ('create_inspection_step','create_payment_step','create_financing_step',
                    'create_transport_step','create_customs_step','advance_transaction_case_step',
                    'assign_transaction_partner','revoke_transaction_partner',
                    '_tc_is_party','_tc_participant_of_role')

  union all
  -- (5) Comptes de lignes
  select 3, 'COUNT', 'transaction_cases',        count(*)::text from public.transaction_cases
  union all select 3, 'COUNT', 'transaction_participants', count(*)::text from public.transaction_participants
  union all select 3, 'COUNT', 'transaction_events',       count(*)::text from public.transaction_events
  union all select 3, 'COUNT', 'inspection_requests',      count(*)::text from public.inspection_requests
  union all select 3, 'COUNT', 'payment_records',          count(*)::text from public.payment_records
  union all select 3, 'COUNT', 'financing_requests',       count(*)::text from public.financing_requests
  union all select 3, 'COUNT', 'transport_requests',       count(*)::text from public.transport_requests
  union all select 3, 'COUNT', 'customs_cases',            count(*)::text from public.customs_cases

  union all
  -- (6) Chaîne bout-en-bout du dernier dossier
  select 4, 'CHAINE', 'participants', (select count(*)::text from public.transaction_participants p where p.case_id = (select id from chain))
  union all select 4, 'CHAINE', 'inspections',  (select count(*)::text from public.inspection_requests i where i.transaction_case_id = (select id from chain))
  union all select 4, 'CHAINE', 'financements', (select count(*)::text from public.financing_requests f where f.transaction_case_id = (select id from chain))
  union all select 4, 'CHAINE', 'transports',   (select count(*)::text from public.transport_requests t where t.transaction_case_id = (select id from chain))
  union all select 4, 'CHAINE', 'paiements',    (select count(*)::text from public.payment_records pr where pr.transaction_case_id = (select id from chain))
  union all select 4, 'CHAINE', 'douanes',      (select count(*)::text from public.customs_cases cu where cu.transaction_case_id = (select id from chain))
  union all select 4, 'CHAINE', 'evenements',   (select count(*)::text from public.transaction_events e where e.case_id = (select id from chain))
) r
order by ord, section, element;
