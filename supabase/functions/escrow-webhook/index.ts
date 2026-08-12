// Edge Function `escrow-webhook` — reçoit les événements du PSP partenaire (séquestre)
// et fait avancer la machine d'état escrow CÔTÉ SERVEUR (service_role). Le client ne
// peut JAMAIS écrire l'état (RLS 0002). La signature HMAC du PSP est vérifiée
// (anti-spoofing) et le traitement est idempotent (via escrow_events).
//
// MineGrid n'encaisse rien : les fonds vivent chez le PSP. On ne fait que refléter
// l'état + journaliser. Déployer avec --no-verify-jwt (l'auth = signature PSP).
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const WEBHOOK_SECRET = Deno.env.get('ESCROW_WEBHOOK_SECRET') ?? '';

// MG-H08 : la table de transitions locale a ete SUPPRIMEE. Elle constituait une
// seconde source de verite, desynchronisable de la base, et autorisait
// `disputed -> released`. La machine d'etats vit desormais uniquement dans
// `public._escrow_transition_allowed`.

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // comparaison constant-time
  if (expected.length !== signature.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i++) out |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  const sig = req.headers.get('x-escrow-signature') ?? '';
  if (!(await verifySignature(raw, sig))) {
    return json({ error: 'Signature invalide' }, 400);
  }

  let evt: {
    escrow_id?: string; event_type?: string; provider_ref?: string; payload?: unknown;
    event_id?: string; provider_event_id?: string; amount?: number; currency?: string;
    buyer_id?: string; seller_id?: string;
  };
  try { evt = JSON.parse(raw); } catch { return json({ error: 'JSON invalide' }, 400); }
  if (!evt.escrow_id || !evt.event_type) return json({ error: 'escrow_id et event_type requis' }, 400);

  // MG-H08 — La coherence financiere n'est plus arbitree ici mais en base, via
  // `apply_escrow_event` (service_role). Cette fonction reste responsable de la
  // signature ; la base impose montant, devise, parties, machine d'etats et
  // release_conditions. Un seul chemin d'ecriture = un seul jeu de garanties,
  // valable aussi pour tout autre appelant (script, correction manuelle).
  const { data: result, error: rpcErr } = await supabase.rpc('apply_escrow_event', {
    p_escrow_id: evt.escrow_id,
    p_event_type: evt.event_type,
    p_provider_event_id: evt.event_id ?? evt.provider_event_id ?? null,
    p_amount: evt.amount ?? null,
    p_currency: evt.currency ?? null,
    p_buyer_id: evt.buyer_id ?? null,
    p_seller_id: evt.seller_id ?? null,
    p_provider_ref: evt.provider_ref ?? null,
    p_payload: evt.payload ?? {},
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    // Incoherence financiere ou transition illegale : 409, pas 500. Le PSP ne
    // doit pas rejouer indefiniment un evenement structurellement invalide.
    if (/mismatch|illegal_transition|release_conditions_not_met|unknown_event_type/.test(msg)) {
      return json({ error: msg }, 409);
    }
    if (/escrow_not_found/.test(msg)) return json({ error: msg }, 404);
    return json({ error: msg }, 500);
  }

  return json(result ?? { received: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
