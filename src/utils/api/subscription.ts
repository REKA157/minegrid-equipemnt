import supabase from '../supabaseClient';

export type SubscriptionType = 'basic' | 'pro' | 'premium' | 'enterprise';

export interface SubscriptionState {
  /** true uniquement si abonnement 'active' ET non expiré, vérifié côté serveur. */
  isActive: boolean;
  type: SubscriptionType | null;
  status: string | null;
  endsAt: string | null;
}

export const INACTIVE_SUBSCRIPTION: SubscriptionState = {
  isActive: false,
  type: null,
  status: null,
  endsAt: null,
};

// SOURCE DE VÉRITÉ de l'abonnement = lecture SERVEUR. Ne JAMAIS dériver l'état
// payant de localStorage : c'est falsifiable en une ligne de console (finding #5).
// L'activation est écrite uniquement par le webhook Stripe (RLS durcie).
//
// On passe par la fonction SQL get_effective_subscription() (SECURITY DEFINER) :
// elle renvoie le MEILLEUR abonnement actif entre celui de l'utilisateur et celui
// du PROPRIÉTAIRE de sa société — ainsi un membre invité hérite du forfait
// entreprise du propriétaire (« le propriétaire paie, l'équipe hérite »). Le
// calcul is_active (statut 'active' ET non expiré) est fait côté serveur.
export async function getMySubscription(): Promise<SubscriptionState> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return INACTIVE_SUBSCRIPTION;

    const { data, error } = await supabase.rpc('get_effective_subscription');
    if (error) return INACTIVE_SUBSCRIPTION;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return INACTIVE_SUBSCRIPTION;

    const isActive = Boolean(row.is_active);
    return {
      isActive,
      type: isActive ? ((row.type as SubscriptionType) ?? null) : null,
      status: row.status ?? null,
      endsAt: row.ends_at ?? null,
    };
  } catch {
    return INACTIVE_SUBSCRIPTION;
  }
}

/** Helpers de gating à utiliser à la place des lectures localStorage. */
export function hasActiveSubscription(s: SubscriptionState): boolean {
  return s.isActive;
}

export function hasEnterprise(s: SubscriptionState): boolean {
  return s.isActive && s.type === 'enterprise';
}
