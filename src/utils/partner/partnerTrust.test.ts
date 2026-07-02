import { describe, it, expect } from 'vitest';
import { computePartnerTrust } from './partnerTrust';
import type { PartnerKpis, AcceptanceKpis } from './partnerKpis';
import type { PartnerScore } from './partnerScore';

const ACC0: AcceptanceKpis = { invited: 0, accepted: 0, declinedOrRevoked: 0, acceptanceRate: 0, avgAcceptanceHours: null };

function kpis(p: Partial<PartnerKpis>): PartnerKpis {
  return {
    volume: 0,
    open: 0,
    completedSuccess: 0,
    completionRate: 0,
    avgProcessingDays: null,
    lateRate: null,
    ...p,
  };
}
function score(hasData: boolean, s: number | null): PartnerScore {
  return {
    hasData,
    score: s,
    components: hasData ? [{ key: 'fiabilite', label: 'f', value: 1, weight: 0.35 }] : [],
  };
}

describe('partnerTrust — confiance dynamique explicable (anti-façade)', () => {
  it('aucune performance mesurée -> insufficient_data, score null', () => {
    const t = computePartnerTrust(kpis({ volume: 5, open: 5 }), ACC0, score(false, null));
    expect(t.hasData).toBe(false);
    expect(t.trustScore).toBeNull();
    expect(t.tier).toBe('insufficient_data');
    expect(t.reasons.length).toBeGreaterThan(0);
  });

  it('historique court (volume < 3) -> tier « new »', () => {
    const t = computePartnerTrust(
      kpis({ volume: 2, open: 0, completedSuccess: 2, completionRate: 1 }),
      ACC0,
      score(true, 90),
    );
    expect(t.tier).toBe('new');
  });

  it('score présent mais 0 dossier terminé -> tier plafonné à « new » (anti-faux-trust)', () => {
    // Garde-fou : même un score élevé (hypothétiquement via acceptation rapide) ne donne
    // pas de confiance tant qu'AUCUN dossier n'est mené au bout.
    const t = computePartnerTrust(
      kpis({ volume: 10, open: 10, completedSuccess: 0, completionRate: 0 }),
      ACC0,
      score(true, 90),
    );
    expect(t.tier).toBe('new');
  });

  it('score élevé + volume suffisant -> gold', () => {
    const t = computePartnerTrust(
      kpis({ volume: 6, open: 0, completedSuccess: 6, completionRate: 1 }),
      ACC0,
      score(true, 90),
    );
    expect(t.tier).toBe('gold');
    expect(t.cancellationRate).toBe(0);
  });

  it('score moyen -> silver ; score faible -> bronze', () => {
    expect(
      computePartnerTrust(kpis({ volume: 5, open: 0, completedSuccess: 4, completionRate: 0.8 }), ACC0, score(true, 65)).tier,
    ).toBe('silver');
    expect(
      computePartnerTrust(kpis({ volume: 5, open: 0, completedSuccess: 2, completionRate: 0.4 }), ACC0, score(true, 40)).tier,
    ).toBe('bronze');
  });

  it('taux d échec élevé PLAFONNE la confiance à bronze (l échec coûte)', () => {
    const t = computePartnerTrust(
      kpis({ volume: 10, open: 0, completedSuccess: 6, completionRate: 0.6 }), // 4 échecs = 40% > 30%
      ACC0,
      score(true, 85), // score qui donnerait gold
    );
    expect(t.cancellationRate).toBeCloseTo(0.4, 5);
    expect(t.tier).toBe('bronze');
    expect(t.reasons.some((r) => r.toLowerCase().includes('plafonnée'))).toBe(true);
  });

  it('reasons explicite chaque facteur (transparence)', () => {
    const t = computePartnerTrust(
      kpis({ volume: 5, open: 0, completedSuccess: 5, completionRate: 1, avgProcessingDays: 2 }),
      { ...ACC0, invited: 5, accepted: 5, acceptanceRate: 1, avgAcceptanceHours: 3 },
      score(true, 88),
    );
    const joined = t.reasons.join(' ');
    expect(joined).toContain('Complétion');
    expect(joined).toContain('Délai moyen');
    expect(joined).toContain('Acceptation');
  });
});
