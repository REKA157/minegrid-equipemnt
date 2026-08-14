// Edge Function `paddle-upgrade` — changement de formule ATOMIQUE (MG-H10).
//
// CONSTAT
//   Le parcours d'upgrade ouvrait un NOUVEL abonnement Paddle via
//   PaddleCheckoutButton, sans annuler ni proratiser l'ancien. Un client deja
//   abonne se retrouvait avec DEUX souscriptions actives, donc double
//   facturation. Le code le reconnaissait explicitement en commentaire
//   (« sera géré côté Paddle avant la prod »).
//
// CORRECTIF
//   On n'ouvre plus de second abonnement : on MODIFIE l'abonnement existant via
//   PATCH /subscriptions/{id} avec proration. Paddle recalcule le montant au
//   prorata et conserve UNE seule souscription. S'il n'existe aucun abonnement
//   Paddle actif, on renvoie `needs_checkout` et le front ouvre un checkout
//   normal — c'est alors une premiere souscription, pas un upgrade.
//
// INVARIANT VISE
//   A tout instant, un utilisateur a AU PLUS une subscription Paddle active.
//
// Secrets requis : PADDLE_API_KEY, PADDLE_ENV, PADDLE_PRICE_PRO_50USD,
// PADDLE_PRICE_PREMIUM_20USD, PADDLE_PRICE_ENTERPRISE_200USD, ALLOWED_ORIGINS.
// Aucun secret n'est expose au front.
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const supabaseAuth = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

const PADDLE_API_BASE =
  (Deno.env.get('PADDLE_ENV') ?? 'sandbox') === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';

// plan interne -> price_id Paddle, lu depuis les secrets DEJA en place
// (PADDLE_PRICE_PRO_50USD, etc.). On evite un PADDLE_PRICE_MAP qui dupliquerait
// ces valeurs : deux sources de verite pour un meme prix finissent par diverger.
// Cote serveur uniquement : un price_id fourni par le client permettrait de
// s'abonner au tarif de son choix.
function priceIdForPlan(plan: string): string | null {
  const map: Record<string, string | undefined> = {
    pro: Deno.env.get('PADDLE_PRICE_PRO_50USD'),
    premium: Deno.env.get('PADDLE_PRICE_PREMIUM_20USD'),
    enterprise: Deno.env.get('PADDLE_PRICE_ENTERPRISE_200USD'),
  };
  return map[plan.toLowerCase()] ?? null;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',')
    .map((o) => o.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    // Le SDK Supabase ajoute x-client-info et apikey a chaque appel : sans eux
    // dans cette liste, le navigateur refuse la requete au stade du preflight.
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { ok: false, reason: 'method' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { ok: false, reason: 'auth' }, 401);
  }
  const jwt = authHeader.replace('Bearer ', '').trim();
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);
  if (userError || !userData.user) {
    return json(req, { ok: false, reason: 'auth' }, 401);
  }

  let body: { plan?: string; idempotency_key?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, reason: 'bad_request' }, 400);
  }
  if (!body.plan) return json(req, { ok: false, reason: 'plan_required' }, 400);

  const priceId = priceIdForPlan(body.plan);
  if (!priceId) return json(req, { ok: false, reason: 'unknown_plan' }, 400);

  if (!PADDLE_API_KEY) {
    console.error('[paddle-upgrade] PADDLE_API_KEY manquante');
    return json(req, { ok: false, reason: 'not_configured' }, 500);
  }

  // Abonnement du COMPTE APPELANT uniquement.
  const { data: row, error: rowError } = await supabaseAdmin
    .from('pro_clients')
    .select('paddle_subscription_id, payment_method, subscription_status')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (rowError) {
    console.error('[paddle-upgrade] lecture pro_clients:', rowError.message);
    return json(req, { ok: false, reason: 'server' }, 500);
  }

  // Aucun abonnement Paddle en cours : ce n'est pas un upgrade mais une
  // premiere souscription. Le front ouvre un checkout classique.
  const active = row?.subscription_status &&
    ['active', 'trialing', 'past_due'].includes(row.subscription_status);
  if (!row || row.payment_method !== 'paddle' || !row.paddle_subscription_id || !active) {
    return json(req, { ok: true, needs_checkout: true });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${PADDLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
  // Idempotence : un double clic ou un retry reseau ne doit pas facturer deux fois.
  if (body.idempotency_key) headers['Paddle-Idempotency-Key'] = body.idempotency_key;
  const abonnementUrl = `${PADDLE_API_BASE}/subscriptions/${row.paddle_subscription_id}`;

  // ---- ETAT REEL DE L'ABONNEMENT CHEZ PADDLE -------------------------------
  // On regarde AVANT de modifier. Paddle refuse en effet de changer le prix d'un
  // abonnement qui porte un changement programme (une resiliation, une mise en
  // pause) ou qui est deja en pause : la demande echoue alors avec un « 502 »
  // cote client, sans que personne sache pourquoi. Constate sur staging le
  // 2026-08-14, apres qu'un test de resiliation eut laisse une annulation
  // programmee sur l'abonnement.
  let resiliationAnnulee = false;
  let abonnementRepris = false;

  const etatResp = await fetch(abonnementUrl, { headers });
  if (etatResp.status === 404) {
    // L'abonnement n'existe plus chez Paddle : il n'y a rien a dupliquer, donc
    // un checkout neuf est legitime.
    return json(req, { ok: true, needs_checkout: true, reason: 'subscription_absente' });
  }
  if (!etatResp.ok) {
    const detail = await etatResp.text().catch(() => '');
    console.error(`[paddle-upgrade] lecture abonnement ${etatResp.status}: ${detail.slice(0, 400)}`);
    return json(req, { ok: false, reason: 'paddle_error', paddle_status: etatResp.status }, 502);
  }

  const etat = await etatResp.json().catch(() => ({}));
  const statut: string = etat?.data?.status ?? '';
  const changementProgramme = etat?.data?.scheduled_change ?? null;

  if (statut === 'canceled') {
    return json(req, { ok: true, needs_checkout: true, reason: 'subscription_canceled' });
  }

  // 1. Lever le changement programme, s'il y en a un. Un client qui choisit une
  //    nouvelle formule veut manifestement rester : on annule donc la
  //    resiliation prevue — mais on le REMONTE, pour que l'ecran le dise. Une
  //    resiliation annulee sans prevenir serait une mauvaise surprise.
  if (changementProgramme?.action) {
    const leverResp = await fetch(abonnementUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ scheduled_change: null }),
    });
    if (!leverResp.ok) {
      const detail = await leverResp.text().catch(() => '');
      console.error(`[paddle-upgrade] levee du changement programme ${leverResp.status}: ${detail.slice(0, 400)}`);
      return json(
        req,
        { ok: false, reason: 'scheduled_change_locked', paddle_status: leverResp.status },
        502,
      );
    }
    resiliationAnnulee = changementProgramme.action === 'cancel';
  }

  // 2. Reprendre un abonnement en pause : on ne peut pas changer le prix d'un
  //    abonnement suspendu.
  if (statut === 'paused') {
    const repriseResp = await fetch(`${abonnementUrl}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ effective_from: 'immediately' }),
    });
    if (!repriseResp.ok) {
      const detail = await repriseResp.text().catch(() => '');
      console.error(`[paddle-upgrade] reprise ${repriseResp.status}: ${detail.slice(0, 400)}`);
      return json(req, { ok: false, reason: 'resume_failed', paddle_status: repriseResp.status }, 502);
    }
    abonnementRepris = true;
  }

  // ---- CHANGEMENT DE PRIX AVEC PRORATION -----------------------------------
  // C'est le coeur du correctif : on modifie l'abonnement EXISTANT.
  // `proration_billing_mode: prorated_immediately` facture immediatement la
  // difference au prorata. Aucune seconde souscription n'est creee.
  const resp = await fetch(
    abonnementUrl,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: 'prorated_immediately',
      }),
    },
  );

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Abonnement annule entre-temps : on bascule vers un checkout neuf plutot
    // que d'echouer, mais on ne cree jamais un second abonnement ACTIF.
    if (resp.status === 400 && detail.includes('subscription_update_when_canceled')) {
      return json(req, { ok: true, needs_checkout: true, reason: 'subscription_canceled' });
    }

    // Le CODE d'erreur de Paddle est renvoye au front. Sans lui, un echec
    // n'apparaissait que sous la forme d'un « 502 Bad Gateway » dans la console
    // du navigateur : impossible de savoir quoi corriger sans ouvrir les
    // journaux Supabase. Ce code est purement technique (« subscription_locked_
    // pending_changes »...), il ne divulgue ni cle ni donnee client.
    let paddleCode = '';
    try {
      paddleCode = String(JSON.parse(detail)?.error?.code ?? '');
    } catch {
      /* corps non JSON : on garde le statut seul */
    }
    console.error(`[paddle-upgrade] API Paddle ${resp.status} (${paddleCode}): ${detail.slice(0, 500)}`);
    return json(
      req,
      { ok: false, reason: 'paddle_error', paddle_status: resp.status, paddle_code: paddleCode },
      502,
    );
  }

  // L'etat d'abonnement fait foi cote webhook : on ne l'ecrit pas ici pour
  // eviter deux sources de verite. Le webhook `paddle-webhook` recevra
  // subscription.updated et mettra pro_clients a jour.
  //
  // `resiliation_annulee` / `abonnement_repris` ne sont pas decoratifs : ce sont
  // des effets de bord REELS sur le contrat du client, que l'ecran doit annoncer.
  return json(req, {
    ok: true,
    upgraded: true,
    plan: body.plan,
    resiliation_annulee: resiliationAnnulee,
    abonnement_repris: abonnementRepris,
  });
});
