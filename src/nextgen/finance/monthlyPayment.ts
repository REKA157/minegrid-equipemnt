// Calcul de mensualité (annuité constante), pur et testable. Utilisé par le simulateur
// de financement. INDICATIF uniquement (l'octroi appartient au partenaire bancaire).

export interface LoanInput {
  amount: number; // montant total
  downPayment?: number; // apport
  annualRatePct: number; // taux nominal annuel en %
  termMonths: number;
}

export interface LoanResult {
  financed: number;
  monthlyPayment: number;
  totalCost: number;
  totalInterest: number;
}

export function monthlyPayment(input: LoanInput): LoanResult {
  const financed = Math.max(0, input.amount - (input.downPayment ?? 0));
  const n = Math.max(1, Math.floor(input.termMonths));
  const monthlyRate = input.annualRatePct / 100 / 12;

  let payment: number;
  if (monthlyRate === 0) {
    payment = financed / n;
  } else {
    const factor = Math.pow(1 + monthlyRate, n);
    payment = (financed * monthlyRate * factor) / (factor - 1);
  }
  const total = payment * n;
  return {
    financed: round2(financed),
    monthlyPayment: round2(payment),
    totalCost: round2(total),
    totalInterest: round2(total - financed),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
