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

  // Transition ATOMIQUE et CONDITIONNELLE (verrou optimiste) : on n'applique le
  // changement QUE si le statut source est TOUJOURS celui qu'on a lu. Les PSP
  // livrent en at-least-once : sans cette garde, deux livraisons concurrentes
  // liraient le même statut, passeraient la garde de transition, et écriraient
  // toutes deux (TOCTOU) -> double-fire d'events, voire remboursement + libération
  // simultanés. `.eq('status', tx.status)` + `.select()` = seule la 1re livraison
  // qui fait AVANCER l'état gagne ; les autres ne modifient 0 ligne.
  const { data: updated, error: uErr } = await supabase
    .from('escrow_transactions')
    .update({ status: target, provider_ref: evt.provider_ref ?? null, updated_at: new Date().toISOString() })
    .eq('id', evt.escrow_id)
    .eq('status', tx.status)
    .select('id');
  if (uErr) return json({ error: uErr.message }, 500);

  // 0 ligne affectée = une autre livraison a déjà fait avancer l'état entre notre
  // lecture et notre écriture. On ne rejoue PAS (pas de 2e event, pas de double effet).
  if (!updated || updated.length === 0) {
    return json({ received: true, idempotent: true, note: 'statut déjà avancé (course évitée)' });
  }

  // Journal append-only : n'est écrit QUE pour la livraison qui a réellement
  // appliqué la transition (donc pas de doublon d'event sous rejeu concurrent).
  await supabase.from('escrow_events').insert({
    escrow_id: evt.escrow_id, event_type: evt.event_type, payload: evt.payload ?? {},
  });

  return json({ received: true, status: target });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
