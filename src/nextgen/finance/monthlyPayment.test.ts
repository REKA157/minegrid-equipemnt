import { describe, it, expect } from 'vitest';
import { monthlyPayment } from './monthlyPayment';

describe('monthlyPayment', () => {
  it('taux zéro = montant / durée', () => {
    const r = monthlyPayment({ amount: 12000, annualRatePct: 0, termMonths: 12 });
    expect(r.monthlyPayment).toBe(1000);
    expect(r.totalInterest).toBe(0);
  });

  it('prend en compte l\'apport', () => {
    const r = monthlyPayment({ amount: 100000, downPayment: 40000, annualRatePct: 0, termMonths: 60 });
    expect(r.financed).toBe(60000);
    expect(r.monthlyPayment).toBe(1000);
  });

  it('annuité avec intérêts (formule standard)', () => {
    // 10 000 € à 12 %/an sur 12 mois ≈ 888,49 €/mois
    const r = monthlyPayment({ amount: 10000, annualRatePct: 12, termMonths: 12 });
    expect(r.monthlyPayment).toBeGreaterThan(888);
    expect(r.monthlyPayment).toBeLessThan(889);
    expect(r.totalInterest).toBeGreaterThan(0);
  });
});
