import { useQuery } from '@tanstack/react-query';
import supabase from '../../utils/supabaseClient';
import { queryKeys } from './queryKeys';

async function fetchPublicMachineCount(): Promise<number> {
  // 'estimated' : le planner renvoie reltuples (instantané), pas de scan complet.
  // Un chiffre d'affichage d'accueil n'a pas besoin d'un COUNT exact sur toute la table.
  const { count, error } = await supabase
    .from('machines')
    .select('id', { count: 'estimated', head: true });

  if (error) {
    console.warn('[usePublicMachineCount]', error);
    return 0;
  }
  return count ?? 0;
}

/** Nombre total d'annonces machines visibles publiquement (COUNT léger). */
export function usePublicMachineCount() {
  return useQuery({
    queryKey: queryKeys.publicMachineCount.all,
    queryFn: fetchPublicMachineCount,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
