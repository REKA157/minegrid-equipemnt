import { initializePaddle, type Paddle } from '@paddle/paddle-js';

// Intégration Paddle (Merchant of Record). Côté navigateur on ne manipule QUE des
// identifiants publics : le client token (VITE_PADDLE_CLIENT_TOKEN, préfixe test_
// en sandbox) et les identifiants de prix pri_…. Aucun secret dans le bundle.
// L'activation d'abonnement reste 100 % serveur (Edge Function paddle-webhook).

let paddlePromise: Promise<Paddle | undefined> | null = null;

// Un seul checkout ouvert à la fois : l'eventCallback global de Paddle.js est
// routé vers l'écouteur du checkout courant.
type CheckoutEvent = 'completed' | 'closed' | 'error';
let currentListener: ((event: CheckoutEvent) => void) | null = null;

export function isPaddleConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PADDLE_CLIENT_TOKEN);
}

function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment:
        import.meta.env.VITE_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN ?? '',
      eventCallback: (event) => {
        if (event?.name === 'checkout.completed') currentListener?.('completed');
        if (event?.name === 'checkout.closed') currentListener?.('closed');
        // checkout.error = l'overlay n'a pas pu s'ouvrir/aboutir (pri_ invalide,
        // domaine non approuvé…). On NE route PAS checkout.payment.error : les
        // refus de carte sont re-tentés DANS l'overlay Paddle.
        if (event?.name === 'checkout.error') currentListener?.('error');
      },
    });
  }
  return paddlePromise;
}

export interface OpenPlanCheckoutOptions {
  /** Identifiant de prix Paddle (pri_…) du plan choisi. */
  paddlePriceId: string;
  /** Code interne du plan ('pro' | 'premium' | 'enterprise') — repris par le webhook. */
  internalPlanId: string;
  /** Utilisateur Supabase à activer côté serveur. */
  userId: string;
  email?: string;
  onCompleted?: () => void;
  onClosed?: () => void;
  /** L'overlay n'a pas pu s'ouvrir/aboutir (config invalide) — pas un refus de carte. */
  onError?: () => void;
}

/**
 * Ouvre le checkout Paddle (overlay hébergé par Paddle : la carte n'est jamais
 * saisie sur notre site). custom_data voyage jusqu'au webhook serveur, qui
 * vérifie que le prix payé correspond bien au plan avant toute activation.
 */
export async function openPlanCheckout(opts: OpenPlanCheckoutOptions): Promise<void> {
  const paddle = await getPaddle();
  if (!paddle) throw new Error('Paddle indisponible (script bloqué ou token invalide)');

  // Si un checkout précédent écoutait encore, on le libère (son bouton repasse
  // à l'état repos) avant de prendre le créneau — sinon il resterait bloqué
  // sur « Ouverture… » sans jamais recevoir d'événement.
  currentListener?.('closed');
  currentListener = (event) => {
    if (event === 'completed') {
      // Invalide le cache useSubscription (même signal que l'ancien flux Stripe).
      window.dispatchEvent(new Event('subscriptionRefreshRequested'));
      opts.onCompleted?.();
    }
    if (event === 'closed') opts.onClosed?.();
    if (event === 'error') opts.onError?.();
  };

  paddle.Checkout.open({
    items: [{ priceId: opts.paddlePriceId, quantity: 1 }],
    customData: { user_id: opts.userId, plan_id: opts.internalPlanId },
    customer: opts.email ? { email: opts.email } : undefined,
    settings: { displayMode: 'overlay', locale: 'fr' },
  });
}
