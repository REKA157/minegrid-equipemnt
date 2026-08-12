import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Sans schéma PostgREST généré, les génériques supabase-js/postgrest-js infèrent
 * `GenericStringError` sur les chaînes de requête. Cast volontaire jusqu'à
 * adoption de `supabase gen types`.
 */

/**
 * MG-L03 — Stockage de session aligne sur la case « Se souvenir de moi ».
 *
 * Avant : la case etait purement decorative. `persistSession: true` conservait
 * la session dans localStorage QUOI QU'IL ARRIVE. Un utilisateur qui la
 * decochait sur un poste partage croyait sa session ephemere alors qu'elle
 * survivait a la fermeture du navigateur — un ecart entre ce qui est promis et
 * ce qui se passe, sur une fonction de securite.
 *
 * Apres : quand la case est decochee, la session vit dans `sessionStorage` et
 * disparait avec l'onglet. La case pilote reellement le comportement.
 */
const PERSIST_FLAG = 'mg:auth:persist';

export function setSessionPersistence(persist: boolean): void {
  try {
    window.localStorage.setItem(PERSIST_FLAG, persist ? '1' : '0');
  } catch {
    /* stockage indisponible : on retombe sur le defaut persistant */
  }
}

function shouldPersist(): boolean {
  try {
    // Defaut historique conserve : en l'absence de choix explicite, on persiste.
    return window.localStorage.getItem(PERSIST_FLAG) !== '0';
  } catch {
    return true;
  }
}

const hybridStorage = {
  getItem(key: string): string | null {
    try {
      // On lit les DEUX : au chargement, le choix courant n'est pas encore connu
      // du point de vue du SDK, et une session ephemere doit rester lisible.
      return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (shouldPersist()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        // Indispensable : sans cette ligne, une session persistante anterieure
        // resterait dans localStorage et survivrait au choix « ne pas retenir ».
        window.localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabaseClient: any = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: hybridStorage,
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x',
    },
  },
});

// Expose pour les tests : c'est l'adaptateur qui decide OU la session atterrit,
// donc c'est lui qu'il faut pouvoir verifier directement.
export const __hybridStorageForTests = hybridStorage;

export default supabaseClient;
