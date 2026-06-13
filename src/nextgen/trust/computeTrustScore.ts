import type { TrustSignals, TrustScoreResult, TrustTier, VerificationKind } from './types';

/**
 * Calcul DÉTERMINISTE et auditable du score de confiance (0-100) d'un acteur.
 *
 * Conçu comme fonction PURE : mêmes signaux → même score, testable et explicable
 * (chaque point est attribué à une source via `breakdown`). En production, cette
 * fonction tourne CÔTÉ SERVEUR (Edge Function / trigger) et écrit `trust_profiles`
 * avec le service_role — le client ne fait que LIRE le résultat (cf. RLS 0001).
 *
 * Barème (max 100) :
 *   Vérifications (max 60)  : identité 15, RC/société 15, fiscal 10, bancaire 10,
 *                            adresse 5, document machine 5
 *   Inspections (max 15)    : taux de réussite × 15
 *   Transactions (max 10)   : min(transactions complétées, 10)
 *   Ancienneté (max 5)      : min(âge/180j, 1) × 5
 *   Pénalité litiges        : −10 par litige
 */
const VERIFICATION_POINTS: Record<VerificationKind, number> = {
  identity: 15,
  company_registration: 15,
  tax_id: 10,
  bank_account: 10,
  address: 5,
  machine_document: 5,
};

const MAX = {
  verifications: 60,
  inspections: 15,
  transactions: 10,
  tenure: 5,
} as const;

const DISPUTE_PENALTY = 10;

export function computeTrustScore(signals: TrustSignals): TrustScoreResult {
  const breakdown: Record<string, number> = {};

  // 1) Vérifications (uniques, plafonnées)
  const seen = new Set<VerificationKind>();
  let verifPoints = 0;
  for (const kind of signals.approvedVerifications) {
    if (seen.has(kind)) continue;
    seen.add(kind);
    verifPoints += VERIFICATION_POINTS[kind] ?? 0;
  }
  verifPoints = Math.min(verifPoints, MAX.verifications);
  breakdown.verifications = verifPoints;

  // 2) Inspections réussies (taux × 15)
  const inspectionRate =
    signals.inspectionsTotal > 0
      ? signals.inspectionsPassed / signals.inspectionsTotal
      : 0;
  const inspectionPoints = Math.round(clamp01(inspectionRate) * MAX.inspections);
  breakdown.inspections = inspectionPoints;

  // 3) Transactions complétées
  const txPoints = Math.min(Math.max(signals.completedTransactions, 0), MAX.transactions);
  breakdown.transactions = txPoints;

  // 4) Ancienneté du compte
  const tenurePoints = Math.round(clamp01(signals.accountAgeDays / 180) * MAX.tenure);
  breakdown.tenure = tenurePoints;

  // 5) Pénalité litiges
  const penalty = Math.max(signals.disputes, 0) * DISPUTE_PENALTY;
  breakdown.disputes = -penalty;

  const raw = verifPoints + inspectionPoints + txPoints + tenurePoints - penalty;
  const score = Math.max(0, Math.min(100, raw));

  return { score, tier: tierForScore(score, seen), breakdown };
}

/**
 * Tier dérivé du score, avec un PLANCHER de sécurité : sans vérification
 * d'identité, on ne peut pas dépasser le tier 'basic' quel que soit le score
 * (un acteur non identifié ne peut pas être « trusted »).
 */
export function tierForScore(score: number, approved: Set<VerificationKind>): TrustTier {
  let tier: TrustTier;
  if (score >= 80) tier = 'elite';
  else if (score >= 60) tier = 'trusted';
  else if (score >= 40) tier = 'verified';
  else if (score >= 20) tier = 'basic';
  else tier = 'unverified';

  if (!approved.has('identity') && (tier === 'verified' || tier === 'trusted' || tier === 'elite')) {
    return 'basic';
  }
  return tier;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
