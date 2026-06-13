import supabase from '../../utils/supabaseClient';
import type { TrustProfile, Verification, VerificationKind } from './types';

// MineGrid Trust Layer — accès données (lecture + soumission).
//
// IMPORTANT (sécurité) : le client ne calcule ni n'écrit JAMAIS le score, ni
// n'approuve une vérification. Il peut LIRE un profil de confiance (badge public)
// et SOUMETTRE une pièce de vérification au statut 'pending' (cf. RLS 0001).
// L'approbation et le recalcul du score sont serveur (service_role).

/** Lit le profil de confiance public d'un utilisateur (badge). */
export async function getTrustProfile(userId: string): Promise<TrustProfile | null> {
  const { data, error } = await supabase
    .from('trust_profiles')
    .select('id, user_id, entity_type, legal_name, country, trust_score, trust_tier, verified_at')
    .eq('user_id', userId)
    .eq('entity_type', 'seller')
    .maybeSingle();
  if (error) return null;
  return (data as TrustProfile) ?? null;
}

/** Profil de confiance de l'utilisateur connecté. */
export async function getMyTrustProfile(): Promise<TrustProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getTrustProfile(user.id);
}

/** Soumet une pièce de vérification (statut forcé 'pending' côté RLS). */
export async function submitVerification(
  trustProfileId: string,
  kind: VerificationKind,
  evidenceUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('verifications').insert({
    trust_profile_id: trustProfileId,
    kind,
    status: 'pending',
    evidence_url: evidenceUrl,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Liste les vérifications de l'utilisateur pour un profil donné. */
export async function getMyVerifications(trustProfileId: string): Promise<Verification[]> {
  const { data, error } = await supabase
    .from('verifications')
    .select('id, trust_profile_id, kind, status, evidence_url, created_at')
    .eq('trust_profile_id', trustProfileId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Verification[]) ?? [];
}
