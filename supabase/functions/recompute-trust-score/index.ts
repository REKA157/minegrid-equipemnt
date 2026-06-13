// Edge Function `recompute-trust-score` — recalcule le score de confiance d'un acteur
// CÔTÉ SERVEUR (service_role) et met à jour trust_profiles. Le client ne peut JAMAIS
// écrire son score (RLS 0001). Déclenchée par le back-office (après approbation d'une
// vérification) ou par cron. Auth = ADMIN_TOKEN (comparaison constant-time).
//
// Le barème reproduit src/nextgen/trust/computeTrustScore.ts (source de vérité partagée).
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';

type Kind = 'identity' | 'company_registration' | 'tax_id' | 'bank_account' | 'address' | 'machine_document';
const VP: Record<Kind, number> = {
  identity: 15, company_registration: 15, tax_id: 10, bank_account: 10, address: 5, machine_document: 5,
};

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function tierFor(score: number, hasIdentity: boolean): string {
  let t = score >= 80 ? 'elite' : score >= 60 ? 'trusted' : score >= 40 ? 'verified' : score >= 20 ? 'basic' : 'unverified';
  if (!hasIdentity && (t === 'verified' || t === 'trusted' || t === 'elite')) t = 'basic';
  return t;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = req.headers.get('x-admin-token') ?? '';
  if (!ADMIN_TOKEN || !constantTimeEq(token, ADMIN_TOKEN)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body: { trust_profile_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const profileId = body.trust_profile_id;
  if (!profileId) return json({ error: 'trust_profile_id requis' }, 400);

  const { data: profile, error: pErr } = await supabase
    .from('trust_profiles').select('id, user_id, created_at').eq('id', profileId).single();
  if (pErr || !profile) return json({ error: 'Profil introuvable' }, 404);

  // Signaux
  const { data: verifs } = await supabase
    .from('verifications').select('kind').eq('trust_profile_id', profileId).eq('status', 'approved');
  const approved = new Set<Kind>((verifs ?? []).map((v: { kind: Kind }) => v.kind));

  let verifPoints = 0;
  approved.forEach((k) => { verifPoints += VP[k] ?? 0; });
  verifPoints = Math.min(verifPoints, 60);

  // Inspections certifiées de cet utilisateur (passées = grade A/B/C/D, F = échec)
  const { data: reqs } = await supabase
    .from('inspection_requests').select('id').eq('requester_id', profile.user_id);
  const reqIds = (reqs ?? []).map((r: { id: string }) => r.id);
  let inspectionsTotal = 0, inspectionsPassed = 0;
  if (reqIds.length) {
    const { data: reports } = await supabase
      .from('inspection_reports').select('overall_grade, certified').in('request_id', reqIds).eq('certified', true);
    inspectionsTotal = (reports ?? []).length;
    inspectionsPassed = (reports ?? []).filter((r: { overall_grade: string }) => r.overall_grade && r.overall_grade !== 'F').length;
  }
  const inspectionPoints = Math.round((inspectionsTotal > 0 ? inspectionsPassed / inspectionsTotal : 0) * 15);

  // Transactions complétées (escrow released) et litiges
  const { data: escrows } = await supabase
    .from('escrow_transactions').select('status').or(`buyer_id.eq.${profile.user_id},seller_id.eq.${profile.user_id}`);
  const completed = (escrows ?? []).filter((e: { status: string }) => e.status === 'released').length;
  const disputes = (escrows ?? []).filter((e: { status: string }) => e.status === 'disputed').length;
  const txPoints = Math.min(completed, 10);

  const ageDays = (Date.now() - new Date(profile.created_at).getTime()) / 86400000;
  const tenurePoints = Math.round(Math.max(0, Math.min(1, ageDays / 180)) * 5);

  const raw = verifPoints + inspectionPoints + txPoints + tenurePoints - disputes * 10;
  const score = Math.max(0, Math.min(100, raw));
  const tier = tierFor(score, approved.has('identity'));

  const { error: uErr } = await supabase
    .from('trust_profiles')
    .update({ trust_score: score, trust_tier: tier, verified_at: approved.has('identity') ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', profileId);
  if (uErr) return json({ error: uErr.message }, 500);

  return json({ trust_profile_id: profileId, score, tier });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
