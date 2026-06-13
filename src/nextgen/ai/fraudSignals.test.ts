import { describe, it, expect } from 'vitest';
import { fraudSignals, type FraudInput } from './fraudSignals';

const clean: FraudInput = {
  price: 100000,
  estimate: 105000,
  sellerTrustScore: 80,
  sellerVerifiedIdentity: true,
  listingAgeMinutes: 5000,
  hasImages: true,
};

describe('fraudSignals', () => {
  it('annonce saine = risque faible', () => {
    const r = fraudSignals(clean);
    expect(r.risk).toBe('low');
    expect(r.reasons).toHaveLength(0);
  });

  it('prix appât + vendeur non vérifié = risque élevé', () => {
    const r = fraudSignals({
      ...clean,
      price: 30000, // ~29% de l'estimation
      sellerVerifiedIdentity: false,
      sellerTrustScore: 10,
    });
    expect(r.risk).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/anormalement bas/i);
    expect(r.reasons.join(' ')).toMatch(/non vérifiée/i);
  });

  it('estimation inconnue ne déclenche pas la règle prix', () => {
    const r = fraudSignals({ ...clean, estimate: null, price: 1 });
    expect(r.reasons.join(' ')).not.toMatch(/marché/i);
  });

  it('score borné à 100', () => {
    const r = fraudSignals({
      price: 1000,
      estimate: 100000,
      sellerTrustScore: 0,
      sellerVerifiedIdentity: false,
      listingAgeMinutes: 1,
      hasImages: false,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.risk).toBe('high');
  });
});
