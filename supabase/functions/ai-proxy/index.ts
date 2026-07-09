// Edge Function `ai-proxy` — utilise la clé IA connectée par la société pour
// faire répondre l'assistant. La clé (OpenAI / Claude / Grok / autre) est lue
// UNIQUEMENT ici, côté serveur (service_role), à partir de la table
// organization_ai_credentials — elle n'est JAMAIS exposée au navigateur.
//
// Entrée (POST, JSON) :
//   { action: 'ping' }                      -> test de connexion
//   { action: 'chat', messages: [...] }     -> conversation ({role, content})
// Sortie : { reply, provider } ou { error, code? } (statut non-2xx sur erreur).
//
// Aucun secret à configurer : SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) {
    return [
      'https://minegrid-equipement.com',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:5188',
      'http://localhost:5299',
    ];
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

interface Cred {
  provider: 'openai' | 'anthropic' | 'xai' | 'custom';
  api_key: string;
  model: string | null;
  base_url: string | null;
}
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
};
const DEFAULT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  xai: 'grok-2-latest',
  anthropic: 'claude-3-5-sonnet-latest',
};

async function callProvider(cred: Cred, messages: ChatMessage[], maxTokens = 1024): Promise<string> {
  const model = (cred.model && cred.model.trim()) || DEFAULT_MODEL[cred.provider] || '';

  if (cred.provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') || undefined;
    const msgs = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': cred.api_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('').trim();
  }

  // OpenAI-compatible : openai, xai, custom.
  const base = ((cred.base_url && cred.base_url.trim()) || DEFAULT_BASE[cred.provider] || '').replace(/\/$/, '');
  if (!base) throw new Error('Adresse du service manquante pour ce fournisseur.');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cred.api_key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`${cred.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

const SYSTEM_PROMPT =
  "Tu es l'assistant commercial de MineGrid Équipement, une marketplace d'engins de chantier et miniers en Afrique. " +
  "Tu aides les vendeurs et loueurs : rédaction d'annonces, réponses aux clients, conseils de prix, relances. " +
  'Réponds en français, de façon claire, concrète et concise.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode non autorisée.' }, 405);

  try {
    // 1) Identifier l'utilisateur via son jeton (à passer EXPLICITEMENT :
    //    dans une fonction serveur il n'y a pas de session persistée).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return json(req, { error: 'Connexion requise.' }, 401);

    // 2) Lire la société + sa clé IA (service_role, côté serveur uniquement).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: mem } = await admin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!mem) return json(req, { error: 'Aucune société associée à ce compte.', code: 'no_org' }, 400);

    const { data: cred } = await admin
      .from('organization_ai_credentials')
      .select('provider, api_key, model, base_url')
      .eq('organization_id', mem.organization_id)
      .maybeSingle();
    if (!cred) {
      return json(req, { error: "Aucune IA connectée. Configurez-la dans « Assistant IA ».", code: 'no_ai' }, 400);
    }

    // 3) Agir.
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'ping' ? 'ping' : 'chat';

    if (action === 'ping') {
      const reply = await callProvider(cred as Cred, [{ role: 'user', content: 'Réponds uniquement: OK' }], 16);
      return json(req, { ok: true, provider: cred.provider, reply });
    }

    const userMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    if (!userMessages.length) return json(req, { error: 'Aucun message.' }, 400);
    const hasSystem = userMessages.some((m) => m.role === 'system');
    const messages = hasSystem ? userMessages : [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...userMessages];

    const reply = await callProvider(cred as Cred, messages, Number(body.maxTokens) || 1024);
    return json(req, { reply, provider: cred.provider });
  } catch (e) {
    return json(req, { error: (e as Error)?.message || String(e) }, 502);
  }
});
