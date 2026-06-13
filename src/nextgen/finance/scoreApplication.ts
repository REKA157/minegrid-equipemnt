// MineGrid Finance — scoring de dossier (heuristique MVP, pure et testable).
// Calcul réellement exécuté CÔTÉ SERVEUR (le client ne peut pas écrire son score,
// cf. RLS finance_applications). Ce n'est PAS une décision de crédit (que MineGrid
// ne prend pas) : c'est un pré-tri pour maximiser la transformation côté partenaire.

export interface FinanceFeatures {
  trustScore: number; // 0-100 (trust_profiles)
  ltv: number; // amount / valeur estimée de la machine (>1 = sur-financé)
  dossierCompleteness: number; // 0-1 (présence Kbis/RC, bilans, RIB)
  completedTransactions: number;
  disputes: number;
  accountAgeDays: number;
}

export type FinanceBand = 'A' | 'B' | 'C' | 'D';

export interface FinanceScore {
  score: number; // 0-100
  band: FinanceBand;
  eligible: boolean;
  reasons: string[];
}

export function scoreApplication(f: FinanceFeatures): FinanceScore {
  const reasons: string[] = [];

  // Confiance (max 40) — proportionnelle au trust_score vérifié du demandeur.
  const trust = clamp(f.trustScore, 0, 100) * 0.4;
  if (f.trustScore < 40) reasons.push('Profil de confiance faible');

  // Complétude du dossier (max 20)
  const completeness = clamp01(f.dossierCompleteness) * 20;
  if (f.dossierCompleteness < 1) reasons.push('Dossier incomplet (pièces manquantes)');

  // Historique transactionnel (max 20)
  const tx = Math.min(Math.max(f.completedTransactions, 0), 10) * 2;

  // Ancienneté (max 10)
  const tenure = clamp01(f.accountAgeDays / 365) * 10;

  // Pénalité LTV : un financement > valeur de la machine est risqué.
  let ltvPenalty = 0;
  if (f.ltv > 1) {
    ltvPenalty = 40;
    reasons.push('Montant demandé supérieur à la valeur estimée de la machine');
  } else if (f.ltv > 0.85) {
    ltvPenalty = 15;
    reasons.push('Apport faible (LTV élevé)');
  }

  // Pénalité litiges
  const disputePenalty = Math.max(f.disputes, 0) * 10;
  if (f.disputes > 0) reasons.push(`${f.disputes} litige(s) au dossier`);

  const raw = trust + completeness + tx + tenure - ltvPenalty - disputePenalty;
  const score = Math.round(clamp(raw, 0, 100));

  const band: FinanceBand = score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  // Éligible à une transmission partenaire si score suffisant ET pas de sur-financement.
  const eligible = score >= 50 && f.ltv <= 1;

  return { score, band, eligible, reasons };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
