// Détecte si le backend est un placeholder de démo (pas de vrai Supabase déployé).
// Quand c'est le cas, les sections « données live » affichent un état honnête
// « en attente de déploiement » au lieu de lancer des appels voués à l'échec.
export function isDemoBackend(): boolean {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return url === '' || url.includes('placeholder') || url.includes('test.supabase');
}

// ---------------------------------------------------------------------------
// MODE PRÉSENTATION (transparent, anti-façade)
// ---------------------------------------------------------------------------
// Permet de PARCOURIR les espaces connectés pour une démo investisseur SANS vrai
// backend. SÉCURITÉ : ne peut s'activer QUE si le backend est un placeholder
// (isDemoBackend). En production (vrai Supabase), ces fonctions sont inertes —
// la session reste gouvernée par Supabase + RLS. Aucune donnée réelle, aucun
// paiement : un bandeau permanent l'indique partout.
const PRESENTATION_KEY = 'minegrid_presentation_mode';

/** Utilisateur de démonstration (jamais un vrai compte). */
export const DEMO_USER = {
  id: '00000000-0000-0000-0000-0000000000de',
  email: 'demo@minegrid.local',
  user_metadata: { full_name: 'Compte de démonstration' },
};

export function isPresentationMode(): boolean {
  if (!isDemoBackend()) return false; // impossible en production
  try {
    return localStorage.getItem(PRESENTATION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPresentationMode(on: boolean): void {
  if (!isDemoBackend()) return; // garde-fou production
  try {
    if (on) localStorage.setItem(PRESENTATION_KEY, '1');
    else localStorage.removeItem(PRESENTATION_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('presentationModeChanged'));
  }
}
