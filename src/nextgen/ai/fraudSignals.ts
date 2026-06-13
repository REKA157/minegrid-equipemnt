// MineGrid IA — détection de fraude à base de règles (MVP), pure et testable.
// S'appuie sur des données RÉELLES : estimation de prix (Data Platform), trust_score
// et vérifications (Trust Layer), fraîcheur de l'annonce. Tracé dans ai_predictions
// (model='fraud_score_v1'). Roadmap : anomaly detection sur historique de litiges.

export interface FraudInput {
  price: number;
  estimate: number | null; // estimation marché (null = inconnu)
  sellerTrustScore: number; // 0-100
  sellerVerifiedIdentity: boolean;
  listingAgeMinutes: number;
  hasImages: boolean;
}

export type FraudRisk = 'low' | 'medium' | 'high';

export interface FraudResult {
  risk: FraudRisk;
  score: number; // 0-100 (plus haut = plus risqué)
  reasons: string[];
}

export function fraudSignals(input: FraudInput): FraudResult {
  const reasons: string[] = [];
  let score = 0;

  // 1) Prix anormalement bas vs marché (appât classique).
  if (input.estimate && input.estimate > 0) {
    const ratio = input.price / input.estimate;
    if (ratio < 0.4) {
      score += 45;
      reasons.push('Prix anormalement bas par rapport au marché (< 40 %)');
    } else if (ratio < 0.6) {
      score += 25;
      reasons.push('Prix nettement sous le marché (< 60 %)');
    }
  }

  // 2) Vendeur non identifié.
  if (!input.sellerVerifiedIdentity) {
    score += 25;
    reasons.push('Identité vendeur non vérifiée');
  }

  // 3) Confiance vendeur faible.
  if (input.sellerTrustScore < 20) {
    score += 15;
    reasons.push('Score de confiance vendeur très faible');
  }

  // 4) Annonce de forte valeur créée très récemment (velocity).
  if (input.listingAgeMinutes < 60 && input.price > 50000) {
    score += 10;
    reasons.push('Annonce de forte valeur créée à l’instant');
  }

  // 5) Aucune image sur un bien à 6 chiffres.
  if (!input.hasImages && input.price > 50000) {
    score += 10;
    reasons.push('Aucune photo pour un équipement de forte valeur');
  }

  score = Math.min(100, score);
  const risk: FraudRisk = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { risk, score, reasons };
}
