import { useQuery } from '@tanstack/react-query';
import supabase from '../../utils/supabaseClient';
import { resolveMachineSector } from '../../utils/machineCategoryMapping';
import { queryKeys } from './queryKeys';

export type CategoryCounts = Record<string, number>;

/**
 * Charge un minimum de colonnes (category, type, specifications) depuis la
 * table `machines` et agrège les compteurs par secteur métier.
 *
 * Protection perf : limite à 5000 lignes. Au-delà, mieux vaut créer une vue
 * SQL côté Supabase (GROUP BY secteur) plutôt que comptage côté client.
 */
async function fetchCategoryCounts(): Promise<CategoryCounts> {
  const { data, error } = await supabase
    .from('machines')
    .select('category, specifications')
    .limit(5000);

  if (error) {
    console.warn('[useCategoryCounts] fetch error:', error);
    return {};
  }
  if (!data) return {};

  const counts: CategoryCounts = {};
  for (const row of data as Array<Record<string, unknown>>) {
    const sector = resolveMachineSector({
      category: row.category as string | null,
      type: null,
      specifications: (row.specifications as { category_name?: string | null } | null) ?? null,
    });
    counts[sector] = (counts[sector] || 0) + 1;
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
