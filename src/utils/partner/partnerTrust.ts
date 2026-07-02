/**
 * Chantier A — Trust partenaire DYNAMIQUE (PUR, testable, explicable).
 *
 * Dérive un niveau de confiance par rôle (mécanicien/inspecteur/transporteur/
 * transitaire/courtier/financier) à partir des KPIs RÉELS (Partner Performance
 * Engine), sans aucune table trust externe. Anti-façade :
 *  - aucune donnée de performance mesurée -> tier 'insufficient_data', score null ;
 *  - le « volume » seul ne crée pas de confiance (hérité de computePartnerScore) ;
 *  - les annulations PLAFONNENT le tier (la confiance se mérite, l'échec coûte).
 * Le résultat est EXPLICABLE : chaque facteur est listé en clair (`reasons`).
 */
import type { PartnerKpis, AcceptanceKpis } from './partnerKpis';
import type { PartnerScore } from './partnerScore';

export type TrustTier = 'insufficient_data' | 'new' | 'bronze' | 'silver' | 'gold';

export interface PartnerTrust {
  hasData: boolean;
  trustScore: number | null; // 0..100 (= score de performance, confiance dérivée)
  tier: TrustTier;
  cancellationRate: number | null; // échecs/annulations parmi les terminaux ; null si aucun terminal
  reasons: string[]; // explicabilité : pourquoi ce niveau
}

const TIER_LABEL: Record<TrustTier, string> = {
  insufficient_data: 'Données insuffisantes',
  new: 'Nouveau',
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
};

export function trustTierLabel(tier: TrustTier): string {
  return TIER_LABEL[tier];
}

const MIN_VOLUME_FOR_TIER = 3; // en-deçà : « nouveau » (pas assez d'historique)
const GOLD_MIN_VOLUME = 5;
const HIGH_CANCELLATION = 0.3; // > 30% d'échecs -> confiance plafonnée à bronze

/**
 * Calcule le trust partenaire. `score` provient de computePartnerScore (déjà
 * anti-façade : null si aucune performance réelle mesurée).
 */
export function computePartnerTrust(
  kpis: PartnerKpis,
  acc: AcceptanceKpis,
  score: PartnerScore,
): PartnerTrust {
  if (!score.hasData || score.score == null) {
    return {
      hasData: false,
      trustScore: null,
      tier: 'insufficient_data',
      cancellationRate: null,
      reasons: ['Pas encore de performance mesurée (aucune étape terminée).'],
    };
  }

  const terminal = kpis.volume - kpis.open;
  const failed = Math.max(0, terminal - kpis.completedSuccess);
  const cancellationRate = terminal > 0 ? failed / terminal : null;

  const reasons: string[] = [];
  reasons.push(`Score de performance ${score.score}/100.`);
  reasons.push(`Complétion ${Math.round(kpis.completionRate * 100)}% (${kpis.completedSuccess}/${terminal} terminés).`);
  if (cancellationRate != null && failed > 0) {
    reasons.push(`${failed} dossier(s) non aboutis (${Math.round(cancellationRate * 100)}%).`);
  }
  if (kpis.avgProcessingDays != null) {
    reasons.push(`Délai moyen de traitement ${kpis.avgProcessingDays.toFixed(1)} j.`);
  }
  if (acc.avgAcceptanceHours != null) {
    reasons.push(`Acceptation moyenne en ${acc.avgAcceptanceHours.toFixed(0)} h.`);
  }
  reasons.push(`${kpis.completedSuccess} dossier(s) menés à bien.`);

  // Tier de base par score + volume.
  let tier: TrustTier;
  if (terminal === 0) {
    // Anti-faux-trust : sans AUCUN dossier mené au bout, la confiance ne peut se
    // mériter (même si la réactivité d'acceptation est bonne) -> plafond « nouveau ».
    tier = 'new';
    reasons.push('Aucun dossier terminé — confiance « nouveau » tant que rien n’est mené à bien.');
  } else if (kpis.volume < MIN_VOLUME_FOR_TIER) {
    tier = 'new';
    reasons.push(`Historique récent (${kpis.volume} dossier(s)) — confiance « nouveau ».`);
  } else if (score.score >= 80 && kpis.volume >= GOLD_MIN_VOLUME) {
    tier = 'gold';
  } else if (score.score >= 50) {
    tier = 'silver';
  } else {
    tier = 'bronze';
  }

  // Les annulations plafonnent la confiance (l'échec coûte, explicitement).
  if (cancellationRate != null && cancellationRate > HIGH_CANCELLATION && (tier === 'gold' || tier === 'silver')) {
    tier = 'bronze';
    reasons.push(`Taux d'échec élevé (> ${Math.round(HIGH_CANCELLATION * 100)}%) — confiance plafonnée à Bronze.`);
  }

  return { hasData: true, trustScore: score.score, tier, cancellationRate, reasons };
}
