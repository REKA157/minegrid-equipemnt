import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import supabase from '../utils/supabaseClient';
import { getPaidPlan, PLAN_RANK } from '../config/plans';
import { getMySubscription } from '../utils/api/subscription';
import type { SubscriptionType } from '../utils/api/subscription';

interface PaddleCheckoutButtonProps {
  /** Code INTERNE du plan ('pro' | 'premium' | 'enterprise') — cf. src/config/plans.ts. */
  planId: SubscriptionType | string;
  onSuccess: () => void;
  onError: (message: string) => void;
  /** Libellé du bouton (défaut : « Payer X USD/mois »). */
  label?: string;
  className?: string;
}

// Attente de l'activation SERVEUR après paiement : Paddle appelle notre webhook
// (paddle-webhook → pro_clients) avec quelques secondes de latence. On interroge
// get_effective_subscription jusqu'à voir le niveau acheté. Le front n'écrit rien.
const ACTIVATION_POLL_ATTEMPTS = 20;
const ACTIVATION_POLL_INTERVAL_MS = 2000;

/**
 * Bouton de paiement par carte via Paddle (remplaçant de StripePaymentForm).
 * Ouvre le checkout hébergé Paddle (overlay), puis attend l'activation serveur.
 */
export default function PaddleCheckoutButton({
  planId,
  onSuccess,
  onError,
  label,
  className,
}: PaddleCheckoutButtonProps) {
  const [state, setState] = useState<'idle' | 'opening' | 'waiting'>('idle');
  const plan = getPaidPlan(planId);

  if (!plan) {
    return (
      <p className="text-sm text-red-600">
        Plan inconnu — rechargez la page et réessayez.
      </p>
    );
  }

  const waitForActivation = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < ACTIVATION_POLL_ATTEMPTS; attempt++) {
      const sub = await getMySubscription();
      if (sub.isActive && sub.type && PLAN_RANK[sub.type] >= PLAN_RANK[plan.internalId]) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, ACTIVATION_POLL_INTERVAL_MS));
    }
    return false;
  };

  const handleClick = async () => {
    if (state !== 'idle') return;
    // Verrou posé AVANT tout await : ferme la fenêtre de double-clic (le disabled
    // est rendu avant que le prochain clic ne puisse être traité).
    setState('opening');

    // Import dynamique : Paddle.js n'entre pas dans le bundle des pages sans paiement.
    const { isPaddleConfigured, openPlanCheckout } = await import('../utils/paddle');

    if (!isPaddleConfigured() || !plan.paddlePriceId) {
      setState('idle');
      onError(
        "Le paiement en ligne n'est pas encore configuré sur cet environnement. " +
          'Utilisez un code promo ou contactez le support.',
      );
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState('idle');
      onError('Connectez-vous pour souscrire un abonnement.');
      return;
    }

    // MG-H10 — INVARIANT : un client a AU PLUS un abonnement Paddle actif.
    //
    // Une seconde souscription ne peut naître que d'un checkout. On distingue
    // donc les deux situations avant d'en ouvrir un, en interrogeant le SERVEUR
    // (get_effective_subscription), jamais le navigateur :
    //
    //  - aucun accès actif  -> première souscription : checkout, rien à dupliquer ;
    //  - accès déjà actif   -> changement de formule : on passe par
    //    `paddle-upgrade`, qui MODIFIE l'abonnement existant (proration). Ici, en
    //    cas d'échec, on N'OUVRE PAS de checkout : mieux vaut un client qui
    //    réessaie qu'un client débité deux fois. Seul le serveur peut lever
    //    l'interdit, en répondant `needs_checkout` (accès actif SANS abonnement
    //    Paddle : code promo, ou abonnement hérité de sa société).
    const dejaActif = (await getMySubscription()).isActive;

    if (dejaActif) {
      let up: { ok?: boolean; upgraded?: boolean; needs_checkout?: boolean } | null = null;
      try {
        const reponse = await supabase.functions.invoke('paddle-upgrade', {
          body: {
            plan: plan.internalId,
            // Idempotence : un double-clic ou un retry reseau ne facture qu'une fois.
            idempotency_key: `upg-${user.id}-${plan.internalId}`,
          },
        });
        // `invoke` ne lève pas sur un statut d'erreur : il le renvoie dans `error`.
        // Sans cette lecture, un 502 passait pour un « rien à faire » et le code
        // enchaînait sur un checkout — exactement le double abonnement à éviter.
        if (reponse.error) throw reponse.error;
        up = reponse.data;
      } catch {
        up = null;
      }

      if (up?.ok && up.upgraded) {
        setState('waiting');
        const activated = await waitForActivation();
        window.dispatchEvent(new Event('subscriptionRefreshRequested'));
        setState('idle');
        if (activated) {
          onSuccess();
        } else {
          onError(
            "Changement de formule enregistré — l'activation prend plus de temps que prévu. " +
              'Rechargez la page dans une minute ; aucun second débit ne sera fait.',
          );
        }
        return;
      }

      if (!up?.ok || !up.needs_checkout) {
        // Échec franc : on refuse plutôt que de risquer une seconde souscription.
        setState('idle');
        onError(
          "Nous n'avons pas pu modifier votre formule. Votre abonnement actuel reste " +
            "en place et aucun second prélèvement n'a été fait. Réessayez dans quelques " +
            'minutes, ou écrivez à contact@minegrid.ma.',
        );
        return;
      }
      // up.needs_checkout : le serveur confirme qu'il n'y a aucun abonnement
      // Paddle à modifier -> le checkout ci-dessous ne peut rien dupliquer.
    }

    try {
      await openPlanCheckout({
        paddlePriceId: plan.paddlePriceId,
        internalPlanId: plan.internalId,
        userId: user.id,
        email: user.email ?? undefined,
        onCompleted: () => {
          setState('waiting');
          void (async () => {
            const activated = await waitForActivation();
            window.dispatchEvent(new Event('subscriptionRefreshRequested'));
            setState('idle');
            if (activated) {
              onSuccess();
            } else {
              onError(
                "Paiement reçu — l'activation prend plus de temps que prévu. " +
                  'Rechargez la page dans une minute ; aucun second débit ne sera fait.',
              );
            }
          })();
        },
        onClosed: () => {
          // Fermeture sans payer : on rend la main (l'état « waiting » reste géré
          // par onCompleted, qui a déjà pris le relais si le paiement est passé).
          setState((s) => (s === 'opening' ? 'idle' : s));
        },
        onError: () => {
          // Même garde que onClosed : une erreur post-paiement ne doit pas
          // interrompre l'attente d'activation.
          setState((s) => (s === 'opening' ? 'idle' : s));
          onError(
            "Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant ou contactez le support.",
          );
        },
      });
    } catch (error) {
      setState('idle');
      onError(
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir le paiement. Réessayez.",
      );
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={state !== 'idle'}
      className={
        className ??
        'w-full bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 font-semibold flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed'
      }
    >
      {state === 'waiting' ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Activation de votre abonnement…
        </>
      ) : state === 'opening' ? (
        <>
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Ouverture du paiement sécurisé…
        </>
      ) : (
        <>
          <Lock className="h-5 w-5 mr-2" />
          {label ?? `Payer ${plan.priceUsd} USD/mois`}
        </>
      )}
    </button>
  );
}
