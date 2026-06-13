import { describe, it, expect } from 'vitest';
import { buildVendeurCockpit } from './buildVendeurCockpit';
import type { RealLead } from '../../../services/realPipelineService';
import type { DashboardStats } from '../../../utils/api/types';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

const lead = (over: Partial<RealLead>): RealLead =>
  ({
    id: 'l1',
    title: 'Prospect',
    stage: 'Prospection',
    priority: 'medium',
    value: 0,
    probability: 10,
    last_contact: new Date(NOW).toISOString(),
    ...over,
  }) as RealLead;

const STATS: DashboardStats = {
  totalViews: 0,
  totalMessages: 0,
  totalOffers: 0,
  weeklyViews: 0,
  monthlyViews: 0,
  weeklyGrowth: 0,
  monthlyGrowth: 0,
};

describe('buildVendeurCockpit', () => {
  it('somme le pipeline ouvert (exclut Conclu/Perdu)', () => {
    const c = buildVendeurCockpit(
      [
        lead({ id: 'a', value: 1000, stage: 'Négociation' }),
        lead({ id: 'b', value: 500, stage: 'Conclu' }),
        lead({ id: 'c', value: 2000, stage: 'Prospection' }),
      ],
      STATS,
      NOW,
    );
    expect(c.revenueValue).toBe(3000);
    expect(c.revenueHint).toContain('2');
  });

  it('signale les prospects sans relance depuis 7 j+ comme risque', () => {
    const old = new Date(NOW - 10 * 86_400_000).toISOString();
    const c = buildVendeurCockpit([lead({ id: 'a', last_contact: old, stage: 'Qualification' })], STATS, NOW);
    expect(c.risks.some((r) => r.id === 'risk:stale')).toBe(true);
  });

  it('signale les prospects chauds comme opportunité', () => {
    const c = buildVendeurCockpit([lead({ id: 'a', probability: 80 })], STATS, NOW);
    expect(c.opportunities.some((o) => o.id === 'opp:hot')).toBe(true);
  });

  it('met les leads high en tête des priorités', () => {
    const c = buildVendeurCockpit(
      [lead({ id: 'lo', priority: 'low', title: 'Bas' }), lead({ id: 'hi', priority: 'high', title: 'Haut' })],
      STATS,
      NOW,
    );
    expect(c.priorities[0]?.id).toBe('lead:hi');
  });

  it('détecte le risque vues élevées / peu de contacts', () => {
    const c = buildVendeurCockpit([], { ...STATS, totalViews: 200, totalMessages: 1 }, NOW);
    expect(c.risks.some((r) => r.id === 'risk:conversion')).toBe(true);
  });

  it('états vides honnêtes sans donnée', () => {
    const c = buildVendeurCockpit([], STATS, NOW);
    expect(c.revenueValue).toBe(0);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
  });
});
