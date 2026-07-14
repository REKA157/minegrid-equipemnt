// Edge Function `delete-account` — suppression de compte RGPD (droit à l'effacement).
//
// Le client NE PEUT PAS supprimer un compte (l'API admin exige service_role). Cette
// fonction, elle : (1) vérifie le JWT du demandeur, (2) purge ses données via la RPC
// SECURITY DEFINER delete_my_account() (scopée auth.uid()), (3) supprime les fichiers
// de son dossier Storage, (4) supprime l'utilisateur auth (cascade FK) via service_role.
//
// Déploiement : supabase functions deploy delete-account
// Secrets : SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto-injectés).

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) {
    return ['https://minegrid-equipement.com', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:5299'];
  }
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode non autorisée.' }, 405);

  try {
    // 1) Identifier le demandeur via son JWT.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json(req, { error: 'Connexion requise.' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return json(req, { error: 'Connexion requise.' }, 401);
    const userId = user.id;

    // 2) Purge des données applicatives (RPC scopée auth.uid() = le demandeur).
    const { data: purge, error: purgeErr } = await userClient.rpc('delete_my_account');
    if (purgeErr) {
      return json(req, { error: `Échec de la purge des données : ${purgeErr.message}` }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3) Storage best-effort : supprimer le dossier documents/<userId>/.
    try {
      const { data: files } = await admin.storage.from('documents').list(userId);
      if (files && files.length) {
        await admin.storage.from('documents').remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* best effort : un échec Storage ne bloque pas la suppression du compte */
    }

    // 4) Supprimer l'utilisateur auth (cascade des tables FK-liées) via service_role.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return json(req, { error: `Compte partiellement supprimé (données purgées) mais échec suppression auth : ${delErr.message}` }, 500);
    }

    return json(req, { ok: true, rows_deleted: (purge as { rows_deleted?: number })?.rows_deleted ?? null });
  } catch (e) {
    return json(req, { error: (e as Error)?.message || String(e) }, 500);
  }
});
