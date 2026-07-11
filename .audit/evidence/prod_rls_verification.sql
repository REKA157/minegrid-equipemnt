-- =====================================================================
-- VÉRIFICATION PROD (READ-ONLY) — état réel de la RLS sur les tables sensibles
-- À exécuter dans Supabase SQL Editor (prod). Ne modifie RIEN. Répond à :
-- « la RLS est-elle bien ACTIVE en prod sur les tables dont la RLS ne vit que
--   dans sql/ manuel (escrow, transaction, finance, inspection, métiers) ? »
-- =====================================================================

-- 1) RLS activée (relrowsecurity) + forcée (relforcerowsecurity) par table sensible.
--    rls_enabled = false sur une de ces lignes = P0 (table exposée).
select
  c.relname                               as table_name,
  c.relrowsecurity                        as rls_enabled,
  c.relforcerowsecurity                   as rls_forced,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as nb_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'escrow_transactions','escrow_events','payment_records','commission_records','financing_requests',
    'transaction_cases','transaction_participants','transaction_documents','transaction_messages',
    'transaction_tasks','transaction_events',
    'finance_applications','finance_partners','inspection_requests','inspection_reports',
    'inspection_media','inspectors','verifications','trust_profiles',
    'customs_cases','transport_requests','logistics_quotes','logistics_tasks','broker_cases',
    'market_projects','market_alerts','price_observations','ai_predictions','platform_events',
    'quote_requests','contact_messages','audit_logs','machine_views','machine_history'
  )
order by c.relrowsecurity asc, c.relname;

-- 2) Tables monétaires : reste-t-il un GRANT d'ÉCRITURE au rôle authenticated ?
--    Une ligne ici (privilege_type INSERT/UPDATE/DELETE) sur payment_records ou
--    commission_records = écriture cliente encore ouverte (à re-verrouiller).
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE')
  and table_name in ('payment_records','commission_records','escrow_transactions','escrow_events')
order by table_name, privilege_type;

-- 3) Collision inspection_reports : quelles colonnes existent réellement en prod ?
--    Présence de 'mechanic_id' => variante transaction_platform (vendeur peut écrire le rapport = risque).
--    Présence de 'certified'/'overall_grade' => variante nextgen (écriture verrouillée service_role).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'inspection_reports'
order by ordinal_position;

-- 4) Politiques d'écriture ouvertes sur inspection_reports (si mechanic_id présent) :
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'inspection_reports';
