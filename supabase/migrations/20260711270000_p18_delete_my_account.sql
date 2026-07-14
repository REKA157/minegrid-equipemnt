-- =====================================================================
-- P18 — Suppression de compte RGPD (droit à l'effacement) — partie données
-- =====================================================================
-- FAILLE : les deux deleteUserAccount() côté client appelaient auth.admin.deleteUser
-- avec la clé ANON (403, inopérant) et n'étaient même pas câblés -> AUCUN parcours
-- de suppression de compte ne fonctionnait, et aucune donnée liée n'était purgée.
--
-- CORRECTIF (partie SQL) : RPC delete_my_account() SECURITY DEFINER qui efface les
-- lignes appartenant à l'APPELANT (auth.uid()) dans toutes les tables user-scopées
-- (boucle GARDÉE : ne touche une table/colonne que si elle existe). L'Edge Function
-- delete-account appelle cette RPC (avec le JWT du user), puis supprime l'utilisateur
-- auth via service_role (ce qui cascade les tables FK-liées).
-- Délimiteur $fn$, idempotent.
-- =====================================================================

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid     uuid := auth.uid();
  r         record;
  v_n       int;
  v_deleted int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Non authentifié');
  end if;

  for r in
    select * from (values
      ('machines', 'sellerid'), ('machines', 'seller_id'),
      ('leads', 'seller_id'), ('leads', 'assigned_to_user_id'),
      ('messages', 'sellerid'), ('messages', 'seller_id'),
      ('documents', 'user_id'),
      ('planning_events', 'user_id'),
      ('devis', 'user_id'),
      ('vitrines', 'user_id'),
      ('pro_clients', 'user_id'),
      ('promo_redemptions', 'user_id'),
      ('member_sessions', 'user_id'),
      ('organization_member_scopes', 'user_id'),
      ('organization_members', 'user_id'),
      ('enterprise_dashboard_configs', 'user_id'),
      ('quote_requests', 'buyer_user_id'), ('quote_requests', 'seller_id')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || r.tbl) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r.tbl and column_name = r.col
       ) then
      execute format('delete from public.%I where %I = $1', r.tbl, r.col) using v_uid;
      get diagnostics v_n = row_count;
      v_deleted := v_deleted + v_n;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rows_deleted', v_deleted);
end;
$fn$;

grant execute on function public.delete_my_account() to authenticated;
