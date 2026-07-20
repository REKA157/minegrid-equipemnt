// Edge Function `paddle-webhook` — activation d'abonnement AUTORITATIVE (serveur).
//
// Successeur de `stripe-webhook` (Paddle = Merchant of Record, seul moyen viable
// pour une société marocaine — cf. .audit/PAYMENT_PROVIDER_ANALYSIS.md). C'est le
// SEUL endroit où un abonnement `pro_clients` est activé : Paddle appelle cet
// endpoint après paiement, on vérifie la signature HMAC (PADDLE_WEBHOOK_SECRET)
// puis on écrit avec la clé service_role. Le front ne touche jamais pro_clients.
//
// Déploiement :
//   supabase functions deploy paddle-webhook --no-verify-jwt
//   (Paddle ne porte pas de JWT Supabase : l'authentification est la signature.)
// Secrets requis : PADDLE_WEBHOOK_SECRET (clé secrète de la « notification
//   destination » Paddle), PADDLE_PRICE_PREMIUM_20USD, PADDLE_PRICE_PRO_50USD,
//   PADDLE_PRICE_ENTERPRISE_200USD (identifiants pri_… du catalogue),
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (fournis par la plateforme).
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const webhookSecret = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? '';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const PLAN_DURATION_DAYS = 30;
// Tolérance d'horodatage de la signature (anti-rejeu), recommandation Paddle.
const SIGNATURE_MAX_AGE_SECONDS = 300;

// RÉCONCILIATION prix ↔ plan : la source de vérité est l'identifiant du PRIX
// réellement payé (le montant est fixé par le catalogue Paddle, pas par le
// client). custom_data.plan_id ne sert que de contrôle croisé.
//
// ⚠️ Piège de nommage (cf. src/config/plans.ts) : les codes INTERNES stockés en
// base ne correspondent plus aux noms affichés — 'pro' est le plan AFFICHÉ
// « Premium » (20 $), 'premium' est le plan AFFICHÉ « Pro » (50 $).
const PRICE_ID_TO_PLAN: ReadonlyArray<{ priceId: string | undefined; plan: string }> = [
  { priceId: Deno.env.get('PADDLE_PRICE_PREMIUM_20USD'), plan: 'pro' },
  { priceId: Deno.env.get('PADDLE_PRICE_PRO_50USD'), plan: 'premium' },
  { priceId: Deno.env.get('PADDLE_PRICE_ENTERPRISE_200USD'), plan: 'enterprise' },
];

function planFromPriceIds(priceIds: string[]): string | null {
  for (const entry of PRICE_ID_TO_PLAN) {
    if (entry.priceId && priceIds.includes(entry.priceId)) return entry.plan;
  }
  return null;
}

// Sièges par plan — doit rester aligné sur maxUsers de src/config/plans.ts
// (Enterprise est vendu « 5 utilisateurs » ; le défaut colonne est 1).
const PLAN_MAX_USERS: Record<string, number> = { pro: 1, premium: 1, enterprise: 5 };

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Header `Paddle-Signature: ts=<unix>;h1=<hex>` — HMAC-SHA256 de `${ts}:${corps brut}`.
async function verifyPaddleSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header || !webhookSecret) return false;

  let ts = '';
  const hashes: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=', 2).map((s) => s?.trim() ?? '');
    if (key === 'ts') ts = value;
    if (key === 'h1' && value) hashes.push(value);
  }
  if (!ts || hashes.length === 0) return false;

  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - tsNumber);
  if (ageSeconds > SIGNATURE_MAX_AGE_SECONDS) return false;

  const expected = await hmacSha256Hex(webhookSecret, `${ts}:${rawBody}`);
  return hashes.some((candidate) => timingSafeEqualHex(candidate.toLowerCase(), expected));
}

interface ActivateParams {
  userId: string;
  planId: string;
  amountCents: number | null;
  transactionId: string | null;
  subscriptionId: string | null;
  periodEndsAt: string | null;
}

async function activateSubscription(params: ActivateParams): Promise<void> {
  const now = new Date();
  const end = params.periodEndsAt
    ? new Date(params.periodEndsAt)
    : new Date(now.getTime() + PLAN_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // Upsert idempotent sur user_id : un même paiement rejoué n'empile pas les lignes.
  const { error } = await supabaseAdmin
    .from('pro_clients')
    .upsert(
      {
        user_id: params.userId,
        subscription_type: params.planId,
        subscription_status: 'active',
        subscription_start: now.toISOString(),
        subscription_end: end.toISOString(),
        payment_method: 'paddle',
        payment_amount: params.amountCents,
        max_users: PLAN_MAX_USERS[params.planId] ?? 1,
        paddle_transaction_id: params.transactionId,
        paddle_subscription_id: params.subscriptionId,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawBody = await req.text();
  const signatureOk = await verifyPaddleSignature(rawBody, req.headers.get('paddle-signature'));
  if (!signatureOk) {
    return new Response('Signature Paddle invalide ou manquante', { status: 401 });
  }

  let event: {
    event_id?: string;
    event_type?: string;
    // deno-lint-ignore no-explicit-any
    data?: any;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  const eventId = event.event_id;
  const eventType = event.event_type;
  if (!eventId || !eventType) return new Response('Événement incomplet', { status: 400 });

  // IDEMPOTENCE : Paddle livre at-least-once (retries pendant ~3 jours). On
  // « claim » l'event_id UNE fois (clé primaire) AVANT de traiter. Un rejeu du
  // même événement est ignoré → pas de prolongation d'abonnement par retry.
  const { error: claimErr } = await supabaseAdmin
    .from('processed_paddle_events')
    .insert({ event_id: eventId, event_type: eventType });
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') {
      return new Response(JSON.stringify({ received: true, idempotent: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(`Erreur idempotence: ${claimErr.message}`, { status: 500 });
  }

  try {
    if (eventType === 'transaction.completed') {
      const txn = event.data ?? {};
      const custom = txn.custom_data ?? {};
      const userId = typeof custom.user_id === 'string' ? custom.user_id : null;
      const declaredPlan = typeof custom.plan_id === 'string' ? custom.plan_id : null;

      const priceIds: string[] = Array.isArray(txn.items)
        ? txn.items
            // deno-lint-ignore no-explicit-any
            .map((item: any) => item?.price?.id)
            .filter((id: unknown): id is string => typeof id === 'string')
        : [];
      const plan = planFromPriceIds(priceIds);

      if (!userId || !plan) {
        // Prix inconnu de notre grille ou custom_data absent : on accuse réception
        // (200) sans activer — pas de retry infini pour un événement inactivable.
        console.error(
          `[paddle-webhook] transaction ${txn.id ?? '?'} ignorée (userId=${userId}, prix=${priceIds.join(',')})`,
        );
      } else if (declaredPlan && declaredPlan !== plan) {
        // Contrôle croisé : le plan annoncé par le client ne correspond pas au
        // prix réellement payé → activation refusée (empêche « payer 20 $,
        // obtenir enterprise » si le front était altéré).
        console.error(
          `[paddle-webhook] plan déclaré (${declaredPlan}) != prix payé (${plan}) — activation refusée`,
        );
      } else {
        const grandTotal = txn.details?.totals?.grand_total;
        const amountCents =
          typeof grandTotal === 'string' && grandTotal !== '' ? Number(grandTotal) : null;
        await activateSubscription({
          userId,
          planId: plan,
          amountCents: Number.isFinite(amountCents as number) ? (amountCents as number) : null,
          transactionId: typeof txn.id === 'string' ? txn.id : null,
          subscriptionId: typeof txn.subscription_id === 'string' ? txn.subscription_id : null,
          periodEndsAt:
            typeof txn.billing_period?.ends_at === 'string' ? txn.billing_period.ends_at : null,
        });
      }
    } else if (eventType === 'subscription.canceled') {
      // Fin d'abonnement effective (Paddle émet cet événement quand la résiliation
      // prend effet). On marque le statut sans toucher aux autres moyens (promo…).
      // ⚠️ 'inactive' est l'état terminal CANONIQUE de la maison : la contrainte
      // pro_clients_subscription_status_check n'autorise que
      // active/trialing/paid/inactive/suspended — PAS 'cancelled' (sinon 23514
      // → 500 → retries Paddle en boucle et résiliation jamais persistée).
      const sub = event.data ?? {};
      const custom = sub.custom_data ?? {};
      const userId = typeof custom.user_id === 'string' ? custom.user_id : null;
      const subscriptionId = typeof sub.id === 'string' ? sub.id : null;

      let query = supabaseAdmin
        .from('pro_clients')
        .update({ subscription_status: 'inactive', updated_at: new Date().toISOString() })
        .eq('payment_method', 'paddle');
      if (subscriptionId) {
        query = query.eq('paddle_subscription_id', subscriptionId);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else {
        console.error('[paddle-webhook] subscription.canceled sans identifiant exploitable');
        query = query.eq('user_id', '00000000-0000-0000-0000-000000000000'); // no-op sûr
      }
      const { error } = await query;
      if (error) throw error;
    }
    // Autres événements (subscription.updated, transaction.paid…) : accusés
    // réception sans action — l'activation se fait sur transaction.completed.
  } catch (err) {
    // Échec de traitement : on RETIRE le claim pour que Paddle puisse retenter.
    await supabaseAdmin.from('processed_paddle_events').delete().eq('event_id', eventId);
    // Les erreurs PostgREST sont des objets simples (pas des instances d'Error) :
    // on sérialise pour que le journal Paddle et les logs montrent la vraie cause.
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else {
      try {
        message = JSON.stringify(err);
      } catch {
        message = 'erreur activation';
      }
    }
    console.error('[paddle-webhook] échec de traitement:', message);
    return new Response(`Erreur d'activation: ${message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
