-- ============================================================
--   VALIDATION DU PONT ESCROW — LECTURE SEULE (1 seul résultat)
-- ============================================================
-- Vérifie que le pont (0 + 7 + 8) est bien en place. Ne modifie rien.
-- Colonnes : section | element | valeur
-- ============================================================

select section, element, valeur
from (
  -- Tables du pont + RLS
  select 1 as ord, 'TABLE' as section, c.relname as element,
         (case when c.relrowsecurity then 'RLS ACTIVE' else 'RLS OFF' end) as valeur
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('escrow_transactions', 'escrow_events', 'price_observations')

  union all
  -- Colonnes de liaison bidirectionnelle
  select 2, 'LIEN', 'payment_records.escrow_transaction_id',
         (case when exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='payment_records'
                  and column_name='escrow_transaction_id') then 'présente' else '*** ABSENTE ***' end)
  union all
  select 2, 'LIEN', 'escrow_transactions.transaction_case_id',
         (case when exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='escrow_transactions'
                  and column_name='transaction_case_id') then 'présente' else '*** ABSENTE ***' end)
  union all
  select 2, 'LIEN', 'price_observations.escrow_transaction_id',
         (case when exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='price_observations'
                  and column_name='escrow_transaction_id') then 'présente' else '*** ABSENTE ***' end)

  union all
  -- Fonctions du pont
  select 3, 'RPC', proname, (case when prosecdef then 'SECURITY DEFINER' else 'invoker' end)
  from pg_proc
  where proname in ('open_case_escrow','link_case_to_escrow','_tc_sync_payment_from_escrow',
                    '_escrow_status_to_payment','_escrow_to_price_observation')

  union all
  -- Triggers de propagation
  select 4, 'TRIGGER', t.tgname,
         (case when t.tgenabled = 'D' then 'désactivé' else 'actif' end)
  from pg_trigger t
  where t.tgname in ('trg_escrow_sync_payment', 'trg_escrow_to_price_observation')
    and not t.tgisinternal

  union all
  -- Données
  select 5, 'COUNT', 'escrow_transactions', count(*)::text from public.escrow_transactions
  union all select 5, 'COUNT', 'price_observations', count(*)::text from public.price_observations
) r
order by ord, section, element;
