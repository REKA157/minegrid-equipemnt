// Edge Function `paddle-cancel` — résiliation RÉELLE de l'abonnement Paddle du
// compte appelant (prise d'effet en fin de période déjà payée).
//
// Avant cette fonction, le bouton « Résilier » du site n'effaçait que des
// drapeaux localStorage : Paddle continuait de facturer. Ici on annule VRAIMENT
// l'abonnement via l'API Paddle ; l'événement subscription.canceled reviendra
// ensuite par `paddle-webhook`, qui passera pro_clients à 'inactive' à l'échéance.
//
// Déploiement :
//   supabase functions deploy paddle-cancel
//   (SANS --no-verify-jwt : l'appelant doit être un utilisateur connecté ;
//    supabase.functions.invoke() joint automatiquement son JWT.)
// Secrets requis : PADDLE_API_KEY (clé API Paddle — SECRÈTE, jamais côté front),
//   PADDLE_ENV ('sandbox' par défaut, 'production' en live),
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (fournis).
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const supabaseAuth = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const PADDLE_API_BASE =
  (Deno.env.get('PADDLE_ENV') ?? 'sandbox') === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
const PADDLE_API_KEY = Deno.env.get('PADDLE_API_KEY') ?? '';

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) {
    return [
      'https://minegrid-equipement.com',
      'http://localhost:5173',
      'http://localhost:5199',
      'http://localhost:4173',
    ];
  }
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const allowed = getAllowedOrigins();
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
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

  // L'abonnement du COMPTE APPELANT uniquement — impossible de résilier autrui.
  const { data: row, error: rowError } = await supabaseAdmin
    .from('pro_clients')
    .select('paddle_subscription_id, payment_method, subscription_status')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (rowError) {
    console.error('[paddle-cancel] lecture pro_clients:', rowError.message);
    return json(req, { ok: false, reason: 'server' }, 500);
  }
  if (!row || row.payment_method !== 'paddle' || !row.paddle_subscription_id) {
    // Accès via code promo / rien à résilier chez Paddle : le front informe
    // l'utilisateur que son accès expirera simplement à sa date de fin.
    return json(req, { ok: false, reason: 'no_paddle_subscription' });
  }
  if (!PADDLE_API_KEY) {
    console.error('[paddle-cancel] PADDLE_API_KEY manquante');
    return json(req, { ok: false, reason: 'not_configured' }, 500);
  }

  // Annulation à la FIN de la période payée (pas de coupure immédiate) : le
  // client garde ce qu'il a payé, aucun prélèvement suivant.
  const resp = await fetch(
    `${PADDLE_API_BASE}/subscriptions/${row.paddle_subscription_id}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ effective_from: 'next_billing_period' }),
    },
  );

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Déjà annulé chez Paddle -> succès idempotent pour l'utilisateur.
    if (resp.status === 400 && detail.includes('subscription_update_when_canceled')) {
      return json(req, { ok: true, alreadyCanceled: true });
    }
    console.error(`[paddle-cancel] API Paddle ${resp.status}: ${detail.slice(0, 500)}`);
    return json(req, { ok: false, reason: 'paddle_error' }, 502);
  }

  return json(req, { ok: true });
});
