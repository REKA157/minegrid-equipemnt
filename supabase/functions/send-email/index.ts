// Edge Function `send-email` — DURCIE.
//
// Avant : CORS `*`, aucune authentification, envoi vers un `to` arbitraire via la
// clé service_role => relais d'emails ouvert (spam / usurpation de domaine).
//
// Maintenant : origine sur allow-list, JWT Supabase obligatoire, destinataire
// restreint à l'adresse de contact configurée (pas de `to` arbitraire), et plus
// aucun « faux succès » simulé. Pour les emails transactionnels destinés au
// vendeur/acheteur, utiliser `send-contact-email` (déjà durci).
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const CONTACT_RECEIVER_EMAIL = Deno.env.get('CONTACT_RECEIVER_EMAIL') ?? '';
const CONTACT_SENDER_EMAIL = Deno.env.get('CONTACT_SENDER_EMAIL') ?? 'contact@minegrid-equipement.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return ['https://minegrid-equipement.com', 'http://localhost:5173', 'http://localhost:4173'];
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode non autorisée' }, 405);

  // 1) Authentification obligatoire (JWT Supabase).
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(req, { error: 'Authentification requise' }, 401);
  const jwt = authHeader.replace('Bearer ', '').trim();
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) return json(req, { error: 'Token invalide' }, 401);

  // 2) Destinataire NON contrôlable par l'appelant : on n'envoie qu'à l'adresse
  // de contact configurée côté serveur (anti-relais ouvert).
  if (!CONTACT_RECEIVER_EMAIL || !RESEND_API_KEY) {
    return json(req, { error: 'Service email non configuré' }, 503);
  }

  let payload: { subject?: string; html?: string };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: 'Corps JSON invalide' }, 400);
  }

  const subject = (payload.subject ?? '').toString().slice(0, 180).trim();
  const html = (payload.html ?? '').toString().slice(0, 30000);
  if (!subject || !html) return json(req, { error: 'subject et html requis' }, 400);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: CONTACT_SENDER_EMAIL,
      to: [CONTACT_RECEIVER_EMAIL],
      reply_to: userData.user.email,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    return json(req, { error: "Échec de l'envoi" }, 502);
  }
  return json(req, { success: true });
});
