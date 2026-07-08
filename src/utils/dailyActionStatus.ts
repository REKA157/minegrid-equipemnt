// ---------------------------------------------------------------------------
// SOURCE UNIQUE des statuts d'action du jour (widget « Actions Commerciales »).
// Les actions sont RECONSTRUITES depuis les données (leads/messages/offres) à
// intervalle régulier : sans mémoire, une action « terminée » ressusciterait.
// Les ids étant stables (lead:<id>, msg:<id>, offer:<id>), on mémorise ici le
// statut/report de chaque action (7 jours) et on le réapplique à chaque rebuild.
//
// Partagé pour que d'autres widgets (ex. Pipeline) affichent le MÊME statut :
// « traité aujourd'hui » sur une carte de lead = l'action a été faite ici.
// ---------------------------------------------------------------------------
export const ACTION_STATUS_KEY = 'dailyActionsStatusV1';

export type PersistedActionState = {
  status?: 'in-progress' | 'completed';
  dueTime?: string;
  at: string;
};

export function readPersistedActionStates(): Record<string, PersistedActionState> {
  try {
    const raw = localStorage.getItem(ACTION_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedActionState>;
    // Purge des entrées de plus de 7 jours (les actions du jour tournent).
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fresh: Record<string, PersistedActionState> = {};
    for (const [id, st] of Object.entries(parsed)) {
      if (new Date(st.at).getTime() >= cutoff) fresh[id] = st;
    }
    return fresh;
  } catch {
    return {};
  }
}

export function persistActionState(id: string, patch: Omit<PersistedActionState, 'at'>): void {
  try {
    const all = readPersistedActionStates();
    all[id] = { ...all[id], ...patch, at: new Date().toISOString() };
    localStorage.setItem(ACTION_STATUS_KEY, JSON.stringify(all));
  } catch {
    /* stockage plein/indisponible : l'UI reste fonctionnelle */
  }
}

/**
 * Statut de l'action du jour rattachée à un LEAD (clé `lead:<id>`), pour les
 * widgets qui veulent afficher « traité / en cours » sur une carte de lead.
 */
export function getLeadActionStatus(
  leadId: string,
): 'completed' | 'in-progress' | null {
  const st = readPersistedActionStates()[`lead:${leadId}`];
  return st?.status ?? null;
}
