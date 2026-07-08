/**
 * Espace de travail « Appels d'offres » partagé par société (Supabase).
 *
 * Sur le modèle de enterprise_dashboard_configs : une ligne JSONB par
 * organisation contenant { tenders, documents, library, company }. Lecture
 * réservée aux membres (RLS), écriture forcée par RPC (l'org est imposée
 * serveur-side). Voir supabase/migrations/20260708160000_teamE_tender_workspace.sql.
 *
 * Mode OPT-IN : actif seulement si VITE_TENDERS_SHARED === 'true' ET
 * l'utilisateur est connecté à une société. Sinon, le module reste 100 %
 * local (comportement actuel inchangé).
 *
 * SÉCURITÉ ANTI-PERTE DE DONNÉES : le chargement distingue explicitement
 *   - 'local'  : pas de partage / pas connecté / pas de société → NE JAMAIS
 *                écrire (le cache local ne doit pas polluer une société) ;
 *   - 'shared' : société valide (espace éventuellement vide) → hydrater puis
 *                autoriser la sauvegarde ;
 *   - 'error'  : échec transitoire (RPC/auth) → NE PAS écrire (on ne sait pas
 *                s'il existe un espace société à protéger).
 */

import supabase from '../supabaseClient';

export interface TenderWorkspaceData {
  tenders?: unknown[];
  documents?: unknown[];
  library?: unknown[];
  company?: unknown;
}

export type WorkspaceLoad =
  | { mode: 'local' }
  | { mode: 'shared'; data: TenderWorkspaceData }
  | { mode: 'error' };

/** Le partage d'équipe est-il demandé côté configuration ? */
export function isTendersSharedConfigured(): boolean {
  return import.meta.env.VITE_TENDERS_SHARED === 'true';
}

/** Id du compte connecté (pour « Mes affectations »), ou null. */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Charge l'espace de travail de la société de l'utilisateur.
 * Ne retombe PAS silencieusement sur null en cas d'erreur : distingue
 * clairement local / partagé / erreur pour éviter tout écrasement.
 */
export async function loadWorkspace(): Promise<WorkspaceLoad> {
  if (!isTendersSharedConfigured()) return { mode: 'local' };

  const userId = await getCurrentUserId();
  if (!userId) return { mode: 'local' }; // pas connecté → local, jamais d'écriture

  try {
    const { data, error } = await supabase.rpc('get_my_tender_workspace');
    if (error) return { mode: 'error' };
    // RPC : null = aucune société ; {} = société sans espace ; {...} = espace.
    if (data === null || data === undefined) return { mode: 'local' };
    if (typeof data !== 'object') return { mode: 'error' };
    return { mode: 'shared', data: data as TenderWorkspaceData };
  } catch {
    return { mode: 'error' };
  }
}

/**
 * Enregistre l'espace de travail (upsert côté société).
 * Renvoie true si écrit sur Supabase, false sinon (pas de société / rôle
 * lecteur / erreur — le client reste alors en local, sans rien écraser).
 */
export async function saveWorkspace(data: TenderWorkspaceData): Promise<boolean> {
  if (!isTendersSharedConfigured()) return false;
  if (!(await getCurrentUserId())) return false;
  try {
    const { data: org, error } = await supabase.rpc('save_my_tender_workspace', {
      p_data: data,
    });
    if (error) return false;
    return Boolean(org);
  } catch {
    return false;
  }
}
