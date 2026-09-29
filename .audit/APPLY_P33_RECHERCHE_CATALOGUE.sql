-- ============================================================================
-- p33 — Rendre le catalogue cherchable CÔTÉ BASE
-- ============================================================================
--
-- LE PROBLÈME QUE CECI RÉSOUT
-- ---------------------------
-- Mesuré le 2026-09-29 sur la production : 16 397 annonces en base, mais la
-- page « Machines » n'en télécharge que 400, et 3 000 au maximum. Or le
-- filtrage, la recherche et le tri sont faits DANS LE NAVIGATEUR, sur les
-- lignes déjà téléchargées. Conséquence chiffrée :
--
--   * 13 397 annonces (82 %) ne sont atteignables par AUCUN filtre ;
--   * le menu « Marque » propose 44 marques sur les 449 réellement en base ;
--   * un acheteur qui cherche « Hitachi » lit « aucun résultat » alors que
--     113 Hitachi sont en vente.
--
-- Le défaut n'est pas dans la base : elle répond en 0,23 s sur la première
-- ligne et 0,27 s sur la 16 000e. Il est dans le fait qu'on ne lui demande
-- jamais de filtrer. Cette migration lui en donne les moyens.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- ----------------------------------
-- Elle ne modifie AUCUNE donnée et ne touche pas à la table `machines`
-- elle-même (aucune colonne ajoutée, aucune contrainte). Elle ajoute une vue,
-- une fonction de lecture et trois index. Elle est donc sans risque pour
-- l'existant, et réversible par trois DROP.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Le prix est stocké en TEXTE : le rendre comparable numériquement
-- ----------------------------------------------------------------------------
-- `machines.price` est de type text (baseline ligne 3153). On ne peut donc pas
-- écrire « prix entre 50 000 et 200 000 » dans une requête.
--
-- On N'AJOUTE PAS de colonne générée à la table : si une seule annonce portait
-- un prix impossible à convertir, l'insertion de cette ligne échouerait et le
-- vendeur ne pourrait plus publier. Une VUE en lecture seule ne peut pas avoir
-- cet effet de bord.
--
-- Le `case` filtre explicitement ce qui ressemble à un nombre ; tout le reste
-- (« Sur demande », « Nous consulter », vide) devient NULL, c'est-à-dire
-- « prix inconnu » — et une annonce au prix inconnu ne doit jamais apparaître
-- dans un filtre « moins de 100 000 € ».

create or replace view public.machines_catalogue
with (security_invoker = true)   -- IMPORTANT : la vue respecte la RLS de
                                 -- l'appelant. Sans cette option, elle
                                 -- s'exécuterait avec les droits de son
                                 -- propriétaire et contournerait la RLS de
                                 -- `machines` — une fuite de données.
as
select
  m.*,
  case
    when regexp_replace(coalesce(m.price, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
      then regexp_replace(coalesce(m.price, ''), '[^0-9.]', '', 'g')::numeric
    else null
  end as price_num
from public.machines m;

comment on view public.machines_catalogue is
  'Vue de lecture du catalogue. Ajoute price_num (prix converti en nombre, NULL si illisible) '
  'pour permettre le filtrage et le tri par prix côté base. security_invoker : la RLS de '
  'machines s''applique normalement.';

grant select on public.machines_catalogue to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Index : sans eux, filtrer côté base serait plus lent qu'aujourd'hui
-- ----------------------------------------------------------------------------

-- Tri et filtre par prix. L'expression est identique, au caractère près, à
-- celle de la vue : sinon PostgreSQL n'utilisera pas cet index.
create index if not exists idx_machines_price_num
  on public.machines (
    (case
      when regexp_replace(coalesce(price, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        then regexp_replace(coalesce(price, ''), '[^0-9.]', '', 'g')::numeric
      else null
    end)
  );

-- Filtre par marque, insensible à la casse (« volvo » doit trouver « Volvo »).
create index if not exists idx_machines_brand_lower
  on public.machines (lower(brand));

-- Filtre par année (« à partir de 2018 »).
create index if not exists idx_machines_year
  on public.machines (year);

-- Recherche texte libre. `ilike '%pelle%'` ne peut utiliser aucun index B-tree ;
-- il faut un index trigramme. L'extension est disponible sur Supabase, mais on
-- reste prudent : si elle manque, la migration continue sans échouer — la
-- recherche sera simplement plus lente (parcours complet de 16 000 lignes,
-- ce qui reste rapide à cette échelle).
do $p33_trgm$
begin
  create extension if not exists pg_trgm;
  create index if not exists idx_machines_nom_trgm
    on public.machines using gin (name gin_trgm_ops);
  create index if not exists idx_machines_marque_trgm
    on public.machines using gin (brand gin_trgm_ops);
  create index if not exists idx_machines_modele_trgm
    on public.machines using gin (model gin_trgm_ops);
exception
  when insufficient_privilege or undefined_file then
    raise notice 'p33 : pg_trgm indisponible, la recherche texte restera en parcours complet.';
end
$p33_trgm$;

-- ----------------------------------------------------------------------------
-- 3. Les listes de filtres, calculées par la base et non par le navigateur
-- ----------------------------------------------------------------------------
-- Aujourd'hui le menu « Marque » est construit à partir des annonces déjà
-- téléchargées : il propose 44 marques sur 449. Cette fonction rend la liste
-- COMPLÈTE, avec le nombre d'annonces pour chacune, en une seule requête
-- légère (moins de 500 lignes au lieu de 16 397).
--
-- `security invoker` (le défaut) + `stable` : la fonction voit exactement ce
-- que l'appelant a le droit de voir, donc la RLS s'applique. Une marque dont
-- toutes les annonces seraient masquées par la RLS n'apparaîtra pas.

create or replace function public.catalogue_facettes()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn_facettes$
  select jsonb_build_object(
    'marques', coalesce((
      select jsonb_agg(x order by x->>'valeur')
      from (
        select jsonb_build_object('valeur', trim(brand), 'nombre', count(*)) as x
        from public.machines
        where brand is not null and trim(brand) <> ''
        group by trim(brand)
      ) s
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(y order by y->>'valeur')
      from (
        select jsonb_build_object('valeur', trim(category), 'nombre', count(*)) as y
        from public.machines
        where category is not null and trim(category) <> ''
        group by trim(category)
      ) s2
    ), '[]'::jsonb),
    'total', (select count(*) from public.machines)
  );
$fn_facettes$;

comment on function public.catalogue_facettes() is
  'Listes complètes des marques et catégories du catalogue, avec leur nombre d''annonces. '
  'Remplace la construction de ces listes à partir des seules annonces téléchargées, '
  'qui n''en montrait qu''une fraction (44 marques sur 449 au 2026-09-29).';

grant execute on function public.catalogue_facettes() to anon, authenticated;

-- ============================================================================
-- POUR ANNULER CETTE MIGRATION
--   drop function if exists public.catalogue_facettes();
--   drop view if exists public.machines_catalogue;
--   drop index if exists idx_machines_price_num, idx_machines_brand_lower,
--                        idx_machines_year, idx_machines_nom_trgm,
--                        idx_machines_marque_trgm, idx_machines_modele_trgm;
-- Le site continue de fonctionner sans elle : il détecte son absence et
-- retombe sur l'ancien comportement (filtrage sur les annonces chargées).
-- ============================================================================
