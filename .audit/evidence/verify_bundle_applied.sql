-- =====================================================================
-- CONTRÔLE DE SANTÉ « bundle appliqué » — READ-ONLY (ne modifie RIEN).
-- À coller dans Supabase → SQL Editor → Run. Lis la colonne « etat » :
--   OK               = conforme
--   INCOMPLET / AUCUN / A REGARDER = à vérifier (colonne « detail » aide au diagnostic)
-- =====================================================================
select n, verif, etat, detail from (

  -- 1) Verrous argent/fraude : AUCUNE écriture cliente sur les tables sensibles.
  select 1 as n,
    'Verrous argent/fraude (aucune ecriture client)' as verif,
    case when count(*) = 0 then 'OK' else 'A REGARDER (' || count(*) || ' grants)' end as etat,
    coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '), 'aucun') as detail
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE')
    and table_name in ('payment_records','commission_records','inspection_reports','pro_clients')

  union all
  -- 2) RPC sécurité/perf créées (8 attendues).
  select 2,
    'RPC creees (8 attendues)',
    case when count(*) = 8 then 'OK' else 'INCOMPLET (' || count(*) || '/8)' end,
    coalesce(string_agg(proname, ', ' order by proname), 'aucune')
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('redeem_promo_code','delete_my_account','remove_org_member','set_org_member_role',
                    'machine_category_counts','machine_engagement_counts','bump_ai_usage','bump_tenders_usage')

  union all
  -- 3) Triggers anti-spam (2 attendus).
  select 3,
    'Triggers anti-spam devis/contact (2 attendus)',
    case when count(*) = 2 then 'OK' else 'INCOMPLET (' || count(*) || '/2)' end,
    coalesce(string_agg(tgname, ', '), 'aucun')
  from pg_trigger
  where not tgisinternal
    and tgname in ('quote_requests_antispam','contact_messages_antispam')

  union all
  -- 4) Nouvelles tables (4 attendues).
  select 4,
    'Tables creees (4 attendues)',
    case when count(*) = 4 then 'OK' else 'INCOMPLET (' || count(*) || '/4)' end,
    coalesce(string_agg(table_name, ', '), 'aucune')
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('promo_codes','promo_redemptions','ai_usage_daily','tenders_ai_usage_daily')

  union all
  -- 5) Code(s) promo actif(s).
  select 5,
    'Code(s) promo actif(s)',
    case when count(*) > 0 then 'OK (' || count(*) || ')' else 'AUCUN' end,
    coalesce(string_agg(code || ' ' || uses_count || '/' || max_uses, ', '), 'aucun')
  from public.promo_codes
  where active = true

  union all
  -- 6) RLS optimisee (p22) : des policies utilisent (select auth.uid()).
  select 6,
    'RLS optimisee initplan (select auth.uid())',
    case when count(*) > 0 then 'OK (' || count(*) || ' policies)' else 'NON APPLIQUE' end,
    ''
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') ~* 'select +auth\.uid' or coalesce(with_check, '') ~* 'select +auth\.uid')

  union all
  -- 7) Anti-enumeration : le client ne peut PAS lire la table des codes promo.
  select 7,
    'promo_codes non lisible par le client',
    case
      when to_regclass('public.promo_codes') is null then 'TABLE ABSENTE'
      when has_table_privilege('authenticated', 'public.promo_codes', 'SELECT')
        or has_table_privilege('anon', 'public.promo_codes', 'SELECT')
      then 'A REGARDER (lisible)' else 'OK' end,
    ''

) t
order by n;
