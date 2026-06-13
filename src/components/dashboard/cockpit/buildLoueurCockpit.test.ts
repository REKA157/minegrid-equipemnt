import { describe, it, expect } from 'vitest';
import { buildLoueurCockpit, type LoueurCockpitInput } from './buildLoueurCockpit';
import type { CorrelatedDailyAction } from '../../../utils/correlateLeadActions';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

const action = (over: Partial<CorrelatedDailyAction>): CorrelatedDailyAction =>
  ({
    id: 'a1',
    title: 'Action',
    description: 'desc',
    priority: 'medium',
    category: 'follow-up',
    dueTime: '09:00',
    status: 'pending',
    estimatedDuration: 20,
    ...over,
  }) as CorrelatedDailyAction;

const base: LoueurCockpitInput = {
  revenue: { revenue: 0, count: 0, growth: 0 },
  actions: [],
  equipmentStats: { total: 0, available: 0, rented: 0, maintenance: 0 },
  upcomingRentals: [],
  pipelineLeads: [],
};

describe('buildLoueurCockpit', () => {
  it('expose le revenu location du mois', () => {
    const c = buildLoueurCockpit({ ...base, revenue: { revenue: 45000, count: 3, growth: 12 } }, NOW);
    expect(c.revenueValue).toBe(45000);
    expect(c.revenueHint).toContain('3 location');
    expect(c.revenueHint).toContain('+12%');
  });

  it('signale les équipements en maintenance comme risque', () => {
    const c = buildLoueurCockpit({ ...base, equipmentStats: { total: 5, available: 2, rented: 2, maintenance: 1 } }, NOW);
    expect(c.risks.some((r) => r.id === 'risk:maintenance')).toBe(true);
  });

  it('signale les retours sous 3 jours', () => {
    const soon = new Date(NOW + 2 * 86_400_000).toISOString();
    const c = buildLoueurCockpit({ ...base, upcomingRentals: [{ id: 'r1', end_date: soon }] }, NOW);
    expect(c.risks.some((r) => r.id === 'risk:returns')).toBe(true);
  });

  it('propose le parc disponible comme opportunité', () => {
    const c = buildLoueurCockpit({ ...base, equipmentStats: { total: 5, available: 3, rented: 2, maintenance: 0 } }, NOW);
    expect(c.opportunities.some((o) => o.id === 'opp:idle')).toBe(true);
  });

  it('reprend les actions corrélées comme priorités (high en urgent)', () => {
    const c = buildLoueurCockpit({ ...base, actions: [action({ id: 'x', title: 'Livrer', priority: 'high' })] }, NOW);
    expect(c.priorities[0]?.id).toBe('x');
    expect(c.priorities[0]?.tone).toBe('urgent');
  });

  it('états vides honnêtes sans donnée', () => {
    const c = buildLoueurCockpit(base, NOW);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
  });
});
