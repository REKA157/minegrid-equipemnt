// ⚠️ OBSOLÈTE (2026-07) : Stripe abandonné (société marocaine non éligible).
// Remplacé par `supabase/functions/paddle-webhook/` — SEUL point d'activation.
// Conservé pour référence tant que la fonction n'est pas dé-déployée de la prod.
//
// Edge Function `stripe-webhook` — activation d'abonnement AUTORITATIVE (serveur).
//
// C'est le SEUL endroit où un abonnement `pro_clients` doit être activé. Stripe
// appelle cet endpoint après un paiement réussi ; on vérifie la signature de
// l'événement (STRIPE_WEBHOOK_SECRET) puis on écrit l'abonnement avec la clé
// service_role. Le front ne doit plus jamais écrire `pro_clients` (cf. RLS durcie
// sql/2026-06_pro_clients_rls_hardening.sql).
//
// Déploiement :
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   (Stripe ne porte pas de JWT Supabase : l'auth est la signature Stripe.)
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import Stripe from 'npm:stripe@14.14.0';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const PLAN_DURATION_DAYS = 30;

// Grille de prix SERVEUR (miroir de create-payment). Sert à réconcilier le montant
// réellement encaissé avec le plan accordé (empêche « payer basic, obtenir premium »).
const PLAN_PRICES_EUR_CENTS: Record<string, number> = {
  basic: 2900, pro: 7000, premium: 14900, enterprise: 29900,
};
function amountMatchesPlan(planId: string, amount: number | null, currency?: string | null): boolean {
  const expected = PLAN_PRICES_EUR_CENTS[planId];
  if (typeof expected !== 'number' || amount !== expected) return false;
  if (currency && currency.toLowerCase() !== 'eur') return false;
  return true;
}

function planDates(): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now.getTime() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return { start: now.toISOString(), end: end.toISOString() };
}

async function activateSubscription(params: {
  userId: string;
  planId: string;
  amount: number | null;
  paymentIntentId: string | null;
}): Promise<void> {
  const { start, end } = planDates();
  // Upsert idempotent sur user_id : un même paiement rejoué n'empile pas les lignes.
  const { error } = await supabaseAdmin
    .from('pro_clients')
    .upsert(
      {
        user_id: params.userId,
        subscription_type: params.planId,
        subscription_status: 'active',
        subscription_start: start,
        subscription_end: end,
        payment_method: 'stripe',
        payment_amount: params.amount,
        stripe_payment_intent_id: params.paymentIntentId,
        updated_at: start,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature || !webhookSecret) {
    return new Response('Signature manquante', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return new Response(`Webhook signature invalide: ${message}`, { status: 400 });
  }

  // IDEMPOTENCE : Stripe livre at-least-once (retries jusqu'à 3 j). On « claim »
  // l'event.id UNE fois (clé primaire) AVANT d'activer. Un rejeu du même event est
  // ignoré -> plus de prolongation/résurrection d'abonnement par simple retry.
  const { error: claimErr } = await supabaseAdmin
    .from('processed_stripe_events')
    .insert({ event_id: event.id, event_type: event.type });
  if (claimErr) {
    // 23505 = déjà traité -> idempotent (on accuse réception sans rejouer).
    if ((claimErr as { code?: string }).code === '23505') {
      return new Response(JSON.stringify({ received: true, idempotent: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(`Erreur idempotence: ${claimErr.message}`, { status: 500 });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = pi.metadata?.userId;
      const planId = pi.metadata?.planId;
      const amount = typeof pi.amount === 'number' ? pi.amount : null;
      if (userId && planId) {
        // Réconciliation : le montant réellement encaissé doit correspondre au plan.
        if (!amountMatchesPlan(planId, amount, pi.currency)) {
          console.error(`[stripe-webhook] montant/devise (${amount}/${pi.currency}) != plan ${planId} — activation ignorée`);
        } else {
          await activateSubscription({ userId, planId, amount, paymentIntentId: pi.id });
        }
      }
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || (session.client_reference_id ?? undefined);
      const planId = session.metadata?.planId;
      const amount = typeof session.amount_total === 'number' ? session.amount_total : null;
      if (userId && planId) {
        if (!amountMatchesPlan(planId, amount, session.currency)) {
          console.error(`[stripe-webhook] montant/devise (${amount}/${session.currency}) != plan ${planId} — activation ignorée`);
        } else {
          await activateSubscription({
            userId, planId, amount,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          });
        }
      }
    }
  } catch (err) {
    // Échec de traitement : on RETIRE le claim pour que Stripe puisse retenter.
    await supabaseAdmin.from('processed_stripe_events').delete().eq('event_id', event.id);
    const message = err instanceof Error ? err.message : 'erreur activation';
    return new Response(`Erreur d'activation: ${message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
