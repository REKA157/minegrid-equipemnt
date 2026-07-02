/**
 * Chantier E — Fraud & Risk Engine (transaction) — PUR, testable, EXPLICABLE.
 *
 * Évalue le risque d'un dossier à partir de SIGNAUX RÉELS (transaction_events +
 * payment_records + inspections). Anti-façade : chaque point de risque correspond à
 * un fait observable ; aucun faux positif arbitraire ; aucun signal -> risque 'low'
 * et liste vide (l'UI n'affiche alors RIEN).
 *
 * Le risque partenaire est traité ailleurs (partnerTrust : annulations/faible
 * complétion -> « à éviter »). Ici : risque au niveau du DOSSIER et du PAIEMENT.
 */
export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskSignal {
  code: string;
  label: string;
  severity: RiskLevel;
}

export interface TransactionRisk {
  level: RiskLevel;
  score: number; // 0..100 (plus haut = plus risqué)
  signals: RiskSignal[];
}

export interface RiskInputs {
  events: Array<{ event_type: string }>;
  payments: Array<{ status: string; amount: number | null; payment_type: string }>;
  inspections: Array<{ status: string }>;
}

const lc = (s: string | null | undefined) => (s || '').trim().toLowerCase();
// Fonds RÉELLEMENT séquestrés chez le PSP (escrow funded/inspection_passed/delivered -> 'held' ;
// cf. _escrow_status_to_payment dans sql/2026-06_escrow_bridge.sql). On EXCLUT 'awaiting_partner'
// et 'pending' : ce sont des escrows OUVERTS mais NON financés (aucun argent engagé), donc l'état
// NORMAL après create_payment_step — jamais un risque en soi (anti-faux-positif).
const FUNDS_HELD = new Set(['held', 'funded', 'in_escrow']);
const INSPECTION_PASSED = new Set(['completed', 'done', 'inspection_passed']);

/** Calcule le risque d'un dossier (faits réels uniquement, explicable). */
export function computeTransactionRisk(inp: RiskInputs): TransactionRisk {
  const signals: RiskSignal[] = [];
  let score = 0;

  const payments = inp.payments;

  // 1) Paiement en litige -> risque élevé.
  if (payments.some((p) => lc(p.status) === 'disputed')) {
    signals.push({ code: 'payment_disputed', label: 'Paiement en litige (escrow disputed).', severity: 'high' });
    score += 45;
  }

  // 2) Fonds RÉELLEMENT séquestrés AVANT inspection validée -> risque élevé (cœur anti-arnaque).
  //    NB : un escrow 'awaiting_partner' (ouvert, non financé) n'est PAS un risque -> exclu.
  const hasFundsHeld = payments.some((p) => FUNDS_HELD.has(lc(p.status)));
  const hasPassedInspection = inp.inspections.some((i) => INSPECTION_PASSED.has(lc(i.status)));
  if (hasFundsHeld && inp.inspections.length > 0 && !hasPassedInspection) {
    signals.push({
      code: 'payment_before_inspection',
      label: 'Fonds séquestrés sans inspection validée.',
      severity: 'high',
    });
    score += 30;
  }

  // 3) Fonds séquestrés mais montant non confirmé (0) -> risque moyen (anomalie : on ne
  //    bloque pas 0). Exclut 'awaiting_partner'/'pending' (montant 0 = état initial normal).
  if (payments.some((p) => FUNDS_HELD.has(lc(p.status)) && (p.amount == null || p.amount <= 0))) {
    signals.push({ code: 'amount_unconfirmed', label: 'Fonds séquestrés au montant non confirmé (0).', severity: 'medium' });
    score += 20;
  }

  // 4) Partenaire désengagé (refus/révocation) -> risque moyen de coordination.
  const declines = inp.events.filter(
    (e) => e.event_type === 'participant.declined' || e.event_type === 'participant.revoked',
  ).length;
  if (declines > 0) {
    signals.push({
      code: 'partner_disengaged',
      label: `${declines} partenaire(s) ayant refusé/quitté le dossier.`,
      severity: 'medium',
    });
    score += Math.min(declines * 10, 20);
  }

  score = Math.min(score, 100);
  const anyHigh = signals.some((s) => s.severity === 'high');
  const level: RiskLevel = anyHigh || score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { level, score, signals };
}
