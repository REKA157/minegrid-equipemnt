/**
 * Partner Performance Engine — matching (PUR, testable).
 * Recommande le meilleur partenaire d'un rôle en classant par score réel.
 * Anti-façade : un candidat sans donnée (hasData=false) n'est PAS recommandé.
 */
import type { PartnerScore } from './partnerScore';

export interface PartnerCandidate {
  partnerId: string;
  label?: string | null;
  score: PartnerScore;
}

/**
 * Classe les candidats par score décroissant. Les candidats sans donnée mesurable
 * sont écartés (jamais de recommandation fondée sur du vide). À score égal, on
 * privilégie celui qui a le plus de composantes mesurées (signal plus fiable).
 */
export function rankPartners(candidates: PartnerCandidate[]): PartnerCandidate[] {
  return candidates
    .filter((c) => c.score.hasData && c.score.score != null)
    .slice()
    .sort((a, b) => {
      const diff = (b.score.score ?? 0) - (a.score.score ?? 0);
      if (diff !== 0) return diff;
      return b.score.components.length - a.score.components.length;
    });
}

/** Meilleur partenaire disponible, ou null si aucun candidat avec donnée réelle. */
export function bestPartner(candidates: PartnerCandidate[]): PartnerCandidate | null {
  const ranked = rankPartners(candidates);
  return ranked.length > 0 ? ranked[0] : null;
}
