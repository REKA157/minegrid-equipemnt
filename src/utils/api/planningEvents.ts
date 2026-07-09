import supabase from '../supabaseClient';

/**
 * Écriture dans l'agenda « Mon planning » (table `planning_events`).
 * Sert à ce qu'un rendez-vous programmé ailleurs (ex. depuis le pipeline
 * commercial) apparaisse aussi dans l'agenda de l'utilisateur.
 */
export interface NewPlanningEvent {
  title: string;
  description?: string;
  /** Début, au format ISO. */
  startDate: string;
  /** Fin, au format ISO (par défaut = début). */
  endDate?: string;
  type: 'rendez-vous' | 'livraison' | 'intervention' | 'maintenance';
  status?: 'planifié' | 'en cours' | 'terminé' | 'annulé';
  priority?: 'basse' | 'normale' | 'haute' | 'urgente';
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  location?: string;
  assignedTo?: string;
  notes?: string;
}

/**
 * Crée un événement dans « Mon planning », scopé sur l'utilisateur courant.
 * Renvoie `true` si créé. Les colonnes suivent exactement PlanningPro
 * (identifiants camelCase : startDate, clientName…).
 */
export async function createPlanningEvent(ev: NewPlanningEvent): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const row = {
    title: ev.title,
    description: ev.description ?? '',
    startDate: ev.startDate,
    endDate: ev.endDate || ev.startDate,
    type: ev.type,
    status: ev.status ?? 'planifié',
    priority: ev.priority ?? 'normale',
    clientName: ev.clientName ?? '',
    clientPhone: ev.clientPhone ?? '',
    clientEmail: ev.clientEmail ?? '',
    location: ev.location ?? '',
    assignedTo: ev.assignedTo ?? '',
    notes: ev.notes ?? '',
    user_id: user.id,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('planning_events').insert(row);
  if (error) {
    console.error('createPlanningEvent', error);
    return false;
  }
  return true;
}
