import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMySubscription,
  INACTIVE_SUBSCRIPTION,
  type SubscriptionState,
} from '../utils/api/subscription';

export const SUBSCRIPTION_QUERY_KEY = ['subscription', 'me'] as const;

/**
 * État d'abonnement dérivé du SERVEUR (jamais de localStorage). À utiliser pour
 * tout gating de fonctionnalité payante (espaces Pro/Enterprise, widgets premium).
 *
 * Se rafraîchit automatiquement après un paiement : StripePaymentForm émet
 * l'événement `subscriptionRefreshRequested`, qui invalide ce cache React Query.
 */
export function useSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    window.addEventListener('subscriptionRefreshRequested', handler);
    return () => window.removeEventListener('subscriptionRefreshRequested', handler);
  }, [queryClient]);

  const query = useQuery<SubscriptionState>({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: getMySubscription,
    staleTime: 60_000,
  });

  return {
    subscription: query.data ?? INACTIVE_SUBSCRIPTION,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
