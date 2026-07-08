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
 */

import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

export interface TenderWorkspaceData {
  tenders?: unknown[];
  documents?: unknown[];
  library?: unknown[];
  company?: unknown;
}

/** Le partage d'équipe est-il demandé côté configuration ? */
export function isTendersSharedConfigured(): boolean {
  return import.meta.env.VITE_TENDERS_SHARED === 'true';
}

/** L'utilisateur est-il authentifié Supabase ? (nécessaire au partage) */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    return Boolean(data?.user);
  } catch {
    return false;
  }
}

/**
 * Charge l'espace de travail de la société de l'utilisateur.
 * Renvoie null si non partagé, non connecté, sans société, ou vide.
 */
export async function loadWorkspace(): Promise<TenderWorkspaceData | null> {
  if (!isTendersSharedConfigured()) return null;
  if (!(await isAuthenticated())) return null;
  const data = await supabaseCall<TenderWorkspaceData | null>(
    async () => {
      const res = await supabase.rpc('get_my_tender_workspace');
      return res;
    },
    { label: 'get_my_tender_workspace', fallback: null },
  );
  if (!data || typeof data !== 'object') return null;
  // La RPC renvoie {} pour une société sans espace encore créé.
  if (Object.keys(data).length === 0) return null;
  return data;
}

/**
 * Enregistre l'espace de travail (upsert côté société).
 * Renvoie true si écrit sur Supabase, false si resté local (pas de société).
 */
export async function saveWorkspace(data: TenderWorkspaceData): Promise<boolean> {
  if (!isTendersSharedConfigured()) return false;
  if (!(await isAuthenticated())) return false;
  const org = await supabaseCall<string | null>(
    async () => {
      const res = await supabase.rpc('save_my_tender_workspace', { p_data: data });
      return res;
    },
    { label: 'save_my_tender_workspace', fallback: null },
  );
  return Boolean(org);
}
