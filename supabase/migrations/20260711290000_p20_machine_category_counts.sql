-- =====================================================================
-- P20 — Comptage agrégé des annonces pour l'accueil (perf)
-- =====================================================================
-- AVANT : useCategoryCounts rapatriait jusqu'à 5000 lignes machines (dont le JSON
-- specifications) puis comptait par secteur en JS -> lourd sur chaque visiteur.
-- APRÈS : la RPC agrège CÔTÉ SQL par (category, category_name) -> quelques dizaines
-- de lignes. Le mapping secteur (logique métier) reste en JS sur ce petit ensemble
-- (pas de duplication du mapping dans le SQL).
--
-- SECURITY DEFINER : lit toutes les machines (les annonces sont publiques) mais ne
-- renvoie QUE des compteurs agrégés (aucune donnée de ligne). Idempotent, $fn$.
-- =====================================================================

create or replace function public.machine_category_counts()
returns table (category text, category_name text, n bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    m.category::text                              as category,
    (m.specifications ->> 'category_name')::text  as category_name,
    count(*)::bigint                              as n
  from public.machines m
  group by m.category, (m.specifications ->> 'category_name');
$fn$;

grant execute on function public.machine_category_counts() to anon, authenticated;
