import { useQuery } from '@tanstack/react-query';
import supabase from '../../utils/supabaseClient';
import { resolveMachineSector } from '../../utils/machineCategoryMapping';
import { queryKeys } from './queryKeys';

export type CategoryCounts = Record<string, number>;

/**
 * Compteurs d'annonces par secteur métier. L'agrégation se fait CÔTÉ SQL
 * (RPC machine_category_counts, migration p20) : on ne rapatrie plus 5000 lignes
 * + leur JSON, mais quelques dizaines de groupes (category, category_name). Le
 * mapping secteur (logique métier) reste en JS sur ce petit ensemble.
 */
async function fetchCategoryCounts(): Promise<CategoryCounts> {
  const { data, error } = await supabase.rpc('machine_category_counts');

  if (error) {
    console.warn('[useCategoryCounts] fetch error:', error);
    return {};
  }
  if (!data) return {};

  const counts: CategoryCounts = {};
  for (const row of data as Array<{ category: string | null; category_name: string | null; n: number }>) {
    const sector = resolveMachineSector({
      category: row.category,
      type: null,
      specifications: row.category_name ? { category_name: row.category_name } : null,
    });
    counts[sector] = (counts[sector] || 0) + Number(row.n);
  }
  return counts;
}

/**
 * Compteurs dynamiques d'annonces par secteur métier (Transport, Terrassement…).
 * Cache 5 min : ces compteurs changent lentement et sont affichés sur l'accueil.
 */
export function useCategoryCounts() {
  return useQuery({
    queryKey: queryKeys.categoryCounts.all,
    queryFn: fetchCategoryCounts,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
