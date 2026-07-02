import { describe, it, expect } from 'vitest';
import { buildNetworkRanking, type NetworkPartner } from './partnerNetwork';
import type { TrustTier } from './partnerTrust';

function np(
  id: string,
  trustScore: number | null,
  openLoad: number,
  cancellationRate: number | null = 0,
  tier: TrustTier = 'silver',
): NetworkPartner {
  return {
    partnerId: id,
    openLoad,
    total: openLoad + 2,
    trust: {
      hasData: trustScore != null,
      trustScore,
      tier: trustScore == null ? 'insufficient_data' : tier,
      cancellationRate,
      reasons: [],
    },
  };
}

describe('partnerNetwork — matching intelligent (confiance + charge, données réelles)', () => {
  it('réseau vide -> best null, listes vides (anti-façade)', () => {
    const r = buildNetworkRanking([]);
    expect(r.best).toBeNull();
    expect(r.ranked).toHaveLength(0);
    expect(r.saturated).toHaveLength(0);
    expect(r.toAvoid).toHaveLength(0);
  });

  it('classe par confiance décroissante et choisit le meilleur DISPONIBLE', () => {
    const r = buildNetworkRanking([np('a', 70, 1), np('b', 90, 1), np('c', 80, 1)]);
    expect(r.ranked.map((p) => p.partnerId)).toEqual(['b', 'c', 'a']);
    expect(r.best?.partnerId).toBe('b');
  });

  it('écarte les partenaires SATURÉS du meilleur disponible', () => {
    // b a la meilleure confiance mais est saturé (charge 5) -> best = c
    const r = buildNetworkRanking([np('b', 95, 5), np('c', 80, 1)]);
    expect(r.saturated.map((p) => p.partnerId)).toContain('b');
    expect(r.best?.partnerId).toBe('c');
  });

  it('écarte les partenaires À ÉVITER (taux d échec élevé) du meilleur', () => {
    const r = buildNetworkRanking([np('b', 95, 1, 0.5), np('c', 70, 1, 0)]);
    expect(r.toAvoid.map((p) => p.partnerId)).toContain('b');
    expect(r.best?.partnerId).toBe('c');
  });

  it('ignore les partenaires sans donnée (jamais recommandés)', () => {
    const r = buildNetworkRanking([np('x', null, 0), np('c', 60, 1)]);
    expect(r.ranked.map((p) => p.partnerId)).toEqual(['c']);
    expect(r.best?.partnerId).toBe('c');
  });

  it('aucun disponible (tous saturés ou à éviter) -> best null mais listes peuplées', () => {
    const r = buildNetworkRanking([np('a', 90, 6), np('b', 80, 1, 0.6)]);
    expect(r.best).toBeNull();
    expect(r.saturated.length + r.toAvoid.length).toBeGreaterThan(0);
  });
});
