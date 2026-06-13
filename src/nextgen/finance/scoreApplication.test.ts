import { describe, it, expect } from 'vitest';
import { scoreApplication, type FinanceFeatures } from './scoreApplication';

const strong: FinanceFeatures = {
  trustScore: 90,
  ltv: 0.6,
  dossierCompleteness: 1,
  completedTransactions: 8,
  disputes: 0,
  accountAgeDays: 400,
};

describe('scoreApplication', () => {
  it('bon dossier = score élevé, band A, éligible', () => {
    const r = scoreApplication(strong);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.band).toBe('A');
    expect(r.eligible).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it('sur-financement (LTV>1) rend non éligible et baisse fortement le score', () => {
    const r = scoreApplication({ ...strong, ltv: 1.2 });
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/valeur estimée/i);
  });

  it('dossier incomplet et confiance faible pénalisent', () => {
    const r = scoreApplication({
      trustScore: 20,
      ltv: 0.9,
      dossierCompleteness: 0.5,
      completedTransactions: 0,
      disputes: 1,
      accountAgeDays: 30,
    });
    expect(r.score).toBeLessThan(50);
    expect(r.eligible).toBe(false);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('score borné [0,100]', () => {
    const r = scoreApplication({ ...strong, disputes: 50 });
    expect(r.score).toBe(0);
  });
});
