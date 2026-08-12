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
  /** Rôles attribués aux salariés (qui peut lire / rédiger / valider / administrer). */
  roleAssignments?: unknown[];
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
 * Résultat d'une écriture d'espace de travail.
 *
 * Volontairement UN SEUL type à champs optionnels, et non une union
 * discriminée : ce projet compile avec `strict: false`, donc sans
 * `strictNullChecks`. Dans ce mode, TypeScript ne restreint PAS une union sur
 * `res.ok`, et l'accès à `res.reason` après un `if (res.ok)` échoue à la
 * compilation.
 */
export interface SaveWorkspaceResult {
  /** true si l'écriture a été appliquée. */
  ok: boolean;
  /** Version résultante, présente uniquement si ok. */
  version?: number;
  /** Cause de l'échec, présente uniquement si !ok. */
  reason?: 'version_conflict' | 'error' | 'no_writable_org';
  /** Version actuelle côté serveur, en cas de conflit. */
  currentVersion?: number;
  /** Données actuelles côté serveur, en cas de conflit. */
  currentData?: unknown;
}

/**
 * Enregistre l'espace de travail avec verrou optimiste (MG-M07).
 *
 * `expectedVersion` est la version lue par ce client. Si l'espace a été modifié
 * entre-temps par un autre membre, l'écriture est REFUSÉE et l'état courant est
 * renvoyé : rien n'est écrasé silencieusement. L'appelant décide alors quoi
 * faire (recharger, fusionner, avertir).
 */
export async function saveWorkspace(
  data: TenderWorkspaceData,
  expectedVersion?: number,
): Promise<SaveWorkspaceResult> {
  if (!isTendersSharedConfigured()) return { ok: false, reason: 'error' };
  if (!(await getCurrentUserId())) return { ok: false, reason: 'error' };
  try {
    const { data: res, error } = await supabase.rpc('save_my_tender_workspace', {
      p_data: data,
      p_expected_version: expectedVersion ?? null,
    });
    if (error || !res) return { ok: false, reason: 'error' };

    if (res.ok === true) return { ok: true, version: Number(res.version) };
    if (res.reason === 'version_conflict') {
      return {
        ok: false,
        reason: 'version_conflict',
        currentVersion: Number(res.current_version),
        currentData: res.current_data,
      };
    }
    return { ok: false, reason: res.reason === 'no_writable_org' ? 'no_writable_org' : 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}