/**
 * Chantier B+F — Partner Network Engine (PUR, testable).
 *
 * Matching intelligent : ne classe plus seulement par score, mais combine
 * CONFIANCE (trust) + CHARGE ACTUELLE (disponibilité) à partir de données RÉELLES.
 * Produit : meilleur partenaire DISPONIBLE, partenaires SATURÉS, partenaires À ÉVITER.
 *
 * Anti-façade : seuls les partenaires avec donnée mesurée sont considérés ;
 * pas de zone géographique inventée (donnée absente -> non utilisée).
 */
import type { PartnerTrust } from './partnerTrust';

export interface NetworkPartner {
  partnerId: string;
  trust: PartnerTrust;
  /** Dossiers OUVERTS actuellement assignés (charge réelle). */
  openLoad: number;
  /** Total d'assignations connues. */
  total: number;
}

export interface NetworkRanking {
  best: NetworkPartner | null; // meilleur DISPONIBLE (non saturé, non à éviter)
  ranked: NetworkPartner[]; // tous, par confiance décroissante (disponibles d'abord)
  saturated: NetworkPartner[]; // charge >= seuil
  toAvoid: NetworkPartner[]; // taux d'échec élevé
}

const SATURATION_DEFAULT = 5; // >= 5 dossiers ouverts simultanés = saturé
const HIGH_CANCELLATION = 0.3;

function isToAvoid(p: NetworkPartner): boolean {
  return p.trust.cancellationRate != null && p.trust.cancellationRate > HIGH_CANCELLATION;
}

/**
 * Classe un réseau de partenaires (d'un même rôle) : meilleur disponible,
 * saturés, à éviter. Tri : confiance décroissante puis charge croissante.
 */
export function buildNetworkRanking(
  partners: NetworkPartner[],
  opts?: { saturationThreshold?: number },
): NetworkRanking {
  const sat = opts?.saturationThreshold ?? SATURATION_DEFAULT;
  const withData = partners.filter((p) => p.trust.hasData && p.trust.trustScore != null);

  const ranked = withData.slice().sort((a, b) => {
    const diff = (b.trust.trustScore ?? 0) - (a.trust.trustScore ?? 0);
    if (diff !== 0) return diff;
    const load = a.openLoad - b.openLoad; // à confiance égale, le moins chargé d'abord
    if (load !== 0) return load;
    return a.partnerId.localeCompare(b.partnerId); // tie-break déterministe
  });

  const saturated = withData.filter((p) => p.openLoad >= sat);
  const toAvoid = withData.filter(isToAvoid);
  const available = ranked.filter((p) => p.openLoad < sat && !isToAvoid(p));
  const best = available.length > 0 ? available[0] : null;

  return { best, ranked, saturated, toAvoid };
}
