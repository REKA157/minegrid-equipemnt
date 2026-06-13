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

type EscrowStatus =
  | 'created' | 'funded' | 'inspection_passed' | 'delivered'
  | 'released' | 'refunded' | 'disputed' | 'cancelled';

const TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  created: ['funded', 'cancelled'],
  funded: ['inspection_passed', 'disputed', 'refunded', 'cancelled'],
  inspection_passed: ['delivered', 'disputed', 'refunded'],
  delivered: ['released', 'disputed'],
  disputed: ['released', 'refunded'],
  released: [], refunded: [], cancelled: [],
};
const EVENT_TARGET: Record<string, EscrowStatus> = {
  funded: 'funded', inspection_passed: 'inspection_passed', delivery_confirmed: 'delivered',
  released: 'released', refunded: 'refunded', dispute_opened: 'disputed', cancelled: 'cancelled',
};

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

  let evt: { escrow_id?: string; event_type?: string; provider_ref?: string; payload?: unknown };
  try { evt = JSON.parse(raw); } catch { return json({ error: 'JSON invalide' }, 400); }
  if (!evt.escrow_id || !evt.event_type) return json({ error: 'escrow_id et event_type requis' }, 400);

  const { data: tx, error } = await supabase
    .from('escrow_transactions').select('id, status').eq('id', evt.escrow_id).single();
  if (error || !tx) return json({ error: 'Transaction introuvable' }, 404);

  const target = EVENT_TARGET[evt.event_type];
  if (!target) return json({ error: 'Événement inconnu' }, 400);

  // Idempotence : si déjà à l'état cible, on accuse réception sans rejouer.
  if (tx.status === target) return json({ received: true, idempotent: true });

  if (!TRANSITIONS[tx.status as EscrowStatus]?.includes(target)) {
    return json({ error: `Transition ${tx.status} -> ${target} interdite` }, 409);
  }

  const { error: uErr } = await supabase
    .from('escrow_transactions')
    .update({ status: target, provider_ref: evt.provider_ref ?? null, updated_at: new Date().toISOString() })
    .eq('id', evt.escrow_id);
  if (uErr) return json({ error: uErr.message }, 500);

  await supabase.from('escrow_events').insert({
    escrow_id: evt.escrow_id, event_type: evt.event_type, payload: evt.payload ?? {},
  });

  return json({ received: true, status: target });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
