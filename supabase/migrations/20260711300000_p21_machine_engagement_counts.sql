-- =====================================================================
-- P21 — Engagement agrégé par machine (widget Stock) — perf
-- =====================================================================
-- AVANT : loadEngagementByMachine rapatriait jusqu'à 3×50 000 lignes (machine_views,
-- offers, messages) puis comptait par machine en JS.
-- APRÈS : une RPC agrège CÔTÉ SQL (GROUP BY machine_id) et renvoie une ligne par
-- machine (views + contacts). offers/messages sont scopés à auth.uid() (le vendeur
-- ne voit QUE son propre engagement) -> aucune fuite en passant des ids d'autrui.
-- SECURITY DEFINER, $fn$, idempotent.
-- =====================================================================

create or replace function public.machine_engagement_counts(p_machine_ids uuid[])
returns table (machine_id uuid, views bigint, contacts bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  with v as (
    select mv.machine_id, count(*) as n
    from public.machine_views mv
    where mv.machine_id = any(p_machine_ids)
    group by mv.machine_id
  ),
  o as (
    select ofr.machine_id, count(*) as n
    from public.offers ofr
    where ofr.seller_id = auth.uid() and ofr.machine_id = any(p_machine_ids)
    group by ofr.machine_id
  ),
  msg as (
    select m.machine_id, count(*) as n
    from public.messages m
    where (m.receiver_id = auth.uid() or m.seller_id = auth.uid())
      and m.machine_id = any(p_machine_ids)
    group by m.machine_id
  )
  select
    mid                                    as machine_id,
    coalesce(v.n, 0)                       as views,
    coalesce(o.n, 0) + coalesce(msg.n, 0)  as contacts
  from unnest(p_machine_ids) as mid
  left join v   on v.machine_id   = mid
  left join o   on o.machine_id   = mid
  left join msg on msg.machine_id = mid;
$fn$;

grant execute on function public.machine_engagement_counts(uuid[]) to authenticated;
