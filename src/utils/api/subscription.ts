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

// SOURCE DE VÉRITÉ de l'abonnement = lecture SERVEUR (table pro_clients protégée par
// RLS SELECT propriétaire). Ne JAMAIS dériver l'état payant de localStorage : c'est
// falsifiable en une ligne de console (finding #5 de l'audit). L'activation, elle,
// est écrite uniquement par le webhook Stripe (cf. stripe-webhook + RLS durcie).
export async function getMySubscription(): Promise<SubscriptionState> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return INACTIVE_SUBSCRIPTION;

    const { data, error } = await supabase
      .from('pro_clients')
      .select('subscription_type, subscription_status, subscription_end')
      .eq('user_id', user.id)
      .single();

    if (error || !data) return INACTIVE_SUBSCRIPTION;

    const notExpired =
      !data.subscription_end || new Date(data.subscription_end).getTime() > Date.now();
    const isActive = data.subscription_status === 'active' && notExpired;

    return {
      isActive,
      type: isActive ? ((data.subscription_type as SubscriptionType) ?? null) : null,
      status: data.subscription_status ?? null,
      endsAt: data.subscription_end ?? null,
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
