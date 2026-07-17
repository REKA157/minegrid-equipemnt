import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { PLAN_RANK, planDisplayName } from '../config/plans';
import type { SubscriptionType } from '../utils/api/subscription';

interface RequireSubscriptionProps {
  /** Niveau d'abonnement minimum requis (défaut : 'pro'). */
  level?: SubscriptionType;
  children: React.ReactNode;
  /** UI alternative si l'abonnement est insuffisant (sinon un écran d'upsell). */
  fallback?: React.ReactNode;
}

/**
 * Garde de route/feature pour les espaces payants. À COMPOSER avec ProtectedRoute
 * (qui vérifie la session) : ProtectedRoute = « connecté ? », RequireSubscription =
 * « abonné au bon niveau ? ». L'état provient EXCLUSIVEMENT du serveur (useSubscription
 * → pro_clients via RLS), jamais de localStorage — un utilisateur ne peut donc plus
 * débloquer un espace payant en modifiant le navigateur (finding #5).
 *
 * Exemple : <ProtectedRoute><RequireSubscription level="enterprise"><EnterpriseDashboard/></RequireSubscription></ProtectedRoute>
 */
export default function RequireSubscription({
  level = 'pro',
  children,
  fallback,
}: RequireSubscriptionProps) {
  const { subscription, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const granted =
    subscription.isActive &&
    subscription.type != null &&
    PLAN_RANK[subscription.type] >= PLAN_RANK[level];

  if (granted) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <div className="min-h-[40vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
        <div className="h-14 w-14 rounded-full bg-primary-100 flex items-center justify-center mb-4 mx-auto">
          <Lock className="h-7 w-7 text-primary-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Espace réservé aux abonnés</h2>
        <p className="text-sm text-gray-500 mt-1">
          {/* Nom COMMERCIAL du palier (≠ code interne — cf. src/config/plans.ts). */}
          Cet espace nécessite un abonnement {planDisplayName(level)} actif.
        </p>
        <a
          href="#tarifs"
          className="inline-block mt-5 w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          Voir les abonnements
        </a>
      </div>
    </div>
  );
}
