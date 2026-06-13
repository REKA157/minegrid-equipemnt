import { describe, it, expect } from 'vitest';
import { computeTrustScore, tierForScore } from './computeTrustScore';
import type { TrustSignals, VerificationKind } from './types';

const base: TrustSignals = {
  approvedVerifications: [],
  inspectionsPassed: 0,
  inspectionsTotal: 0,
  completedTransactions: 0,
  disputes: 0,
  accountAgeDays: 0,
};

describe('computeTrustScore', () => {
  it('acteur vierge = score 0, tier unverified', () => {
    const r = computeTrustScore(base);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('unverified');
  });

  it('vendeur pleinement vérifié + historique = elite', () => {
    const r = computeTrustScore({
      approvedVerifications: ['identity', 'company_registration', 'tax_id', 'bank_account', 'address', 'machine_document'],
      inspectionsPassed: 4,
      inspectionsTotal: 4,
      completedTransactions: 10,
      disputes: 0,
      accountAgeDays: 365,
    });
    expect(r.breakdown.verifications).toBe(60);
    expect(r.breakdown.inspections).toBe(15);
    expect(r.score).toBe(90); // 60 + 15 + 10 + 5
    expect(r.tier).toBe('elite');
  });

  it('plancher : sans identité, on ne dépasse pas basic même avec un score élevé', () => {
    const r = computeTrustScore({
      ...base,
      approvedVerifications: ['company_registration', 'tax_id', 'bank_account', 'address', 'machine_document'],
      completedTransactions: 10,
      accountAgeDays: 365,
    });
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.tier).toBe('basic'); // bridé faute d'identité vérifiée
  });

  it('les litiges pénalisent le score (−10 chacun)', () => {
    const withoutDispute = computeTrustScore({
      ...base,
      approvedVerifications: ['identity', 'company_registration'],
      completedTransactions: 5,
    });
    const withDispute = computeTrustScore({
      ...base,
      approvedVerifications: ['identity', 'company_registration'],
      completedTransactions: 5,
      disputes: 2,
    });
    expect(withDispute.score).toBe(withoutDispute.score - 20);
    expect(withDispute.breakdown.disputes).toBe(-20);
  });

  it('vérifications dupliquées ne comptent qu\'une fois', () => {
    const dup = ['identity', 'identity', 'identity'] as VerificationKind[];
    const r = computeTrustScore({ ...base, approvedVerifications: dup });
    expect(r.breakdown.verifications).toBe(15);
  });

  it('score borné à [0,100]', () => {
    const r = computeTrustScore({
      approvedVerifications: ['identity', 'company_registration', 'tax_id', 'bank_account', 'address', 'machine_document'],
      inspectionsPassed: 10,
      inspectionsTotal: 10,
      completedTransactions: 999,
      disputes: 0,
      accountAgeDays: 99999,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe('tierForScore', () => {
  it('mappe les seuils', () => {
    const id = new Set<VerificationKind>(['identity']);
    expect(tierForScore(85, id)).toBe('elite');
    expect(tierForScore(65, id)).toBe('trusted');
    expect(tierForScore(45, id)).toBe('verified');
    expect(tierForScore(25, id)).toBe('basic');
    expect(tierForScore(5, id)).toBe('unverified');
  });
});
