-- =====================================================================
-- P21 — Engagement agrégé par machine (widget Stock) — perf
-- =====================================================================
-- AVANT : loadEngagementByMachine rapatriait jusqu'à 3×50 000 lignes (machine_views,
-- offers, messages) puis comptait par machine en JS.
-- APRÈS : une RPC agrège CÔTÉ SQL et renvoie une ligne par machine (views + contacts).
-- offers/messages sont scopés à auth.uid() (le vendeur ne voit QUE son engagement).
--
-- ROBUSTESSE (corrigé) : certaines installations n'ont PAS toutes ces tables
-- (ex. `offers` peut être absente). En `language sql`, le corps serait validé À LA
-- CRÉATION et la migration échouerait (« relation public.offers does not exist »),
-- bloquant le reste du bundle. On passe donc en `plpgsql` (corps validé à l'appel)
-- avec une garde `to_regclass` par table : une source absente contribue simplement 0.
-- La RPC existe donc TOUJOURS (contrat frontend stable) et ne casse jamais.
-- SECURITY DEFINER, $fn$, idempotent.
-- =====================================================================

create or replace function public.machine_engagement_counts(p_machine_ids uuid[])
returns table (machine_id uuid, views bigint, contacts bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_views_src text :=
    case when to_regclass('public.machine_views') is not null
      then '(select count(*) from public.machine_views mv where mv.machine_id = ids.mid)'
      else '0' end;
  v_offers_src text :=
    case when to_regclass('public.offers') is not null
      then '(select count(*) from public.offers ofr where ofr.machine_id = ids.mid and ofr.seller_id = auth.uid())'
      else '0' end;
  v_msg_src text :=
    case when to_regclass('public.messages') is not null
      then '(select count(*) from public.messages m where m.machine_id = ids.mid and (m.receiver_id = auth.uid() or m.seller_id = auth.uid()))'
      else '0' end;
begin
  return query execute
       'select ids.mid as machine_id, '
    || 'coalesce(' || v_views_src  || ', 0)::bigint as views, '
    || '(coalesce(' || v_offers_src || ', 0) + coalesce(' || v_msg_src || ', 0))::bigint as contacts '
    || 'from (select unnest($1) as mid) ids'
  using p_machine_ids;
exception
  when undefined_column or undefined_table then
    -- Dégradation gracieuse si une colonne/table attendue diffère selon l'install :
    -- on renvoie une ligne par machine (0 engagement) plutôt que d'échouer.
    return query select ids.mid, 0::bigint, 0::bigint
                 from (select unnest(p_machine_ids) as mid) ids;
end
$fn$;

grant execute on function public.machine_engagement_counts(uuid[]) to authenticated;
