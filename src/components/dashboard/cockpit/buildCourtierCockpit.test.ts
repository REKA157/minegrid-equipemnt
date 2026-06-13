import { describe, it, expect } from 'vitest';
import { buildCourtierCockpit, type CourtierCockpitInput } from './buildCourtierCockpit';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

const base: CourtierCockpitInput = {
  credits: [],
  policies: [],
  commissions: {
    totalCommission: 0,
    creditCommission: 0,
    policyCommission: 0,
    monthCommission: 0,
    creditMonth: 0,
    policyMonth: 0,
    creditCount: 0,
    policyCount: 0,
  },
  clients: [],
};

describe('buildCourtierCockpit', () => {
  it('expose les commissions du mois comme headline en MAD', () => {
    const c = buildCourtierCockpit(
      {
        ...base,
        commissions: {
          ...base.commissions,
          monthCommission: 12500,
          totalCommission: 80000,
          creditCommission: 50000,
          policyCommission: 30000,
        },
      },
      NOW,
    );
    expect(c.revenueValue).toBe(12500);
    expect(c.revenueUnit).toBe('MAD');
    expect(c.revenueAvailable).toBe(true);
    expect(c.revenueHint).toContain('crédit');
  });

  it('priorise un crédit avec décision banque imminente (≤7j)', () => {
    const c = buildCourtierCockpit(
      {
        ...base,
        credits: [
          { status: 'En cours', expected_decision_date: inDays(5) },
        ] as CourtierCockpitInput['credits'],
      },
      NOW,
    );
    expect(c.priorities.some((p) => p.id === 'priority:credit-decision-imminent')).toBe(true);
    expect(c.priorities[0]?.tone).toBe('urgent');
  });

  it('priorise renouvellement de police (≤30j, auto_renewal=false) et devis à convertir', () => {
    const c = buildCourtierCockpit(
      {
        ...base,
        policies: [
          { status: 'Active', end_date: inDays(15), auto_renewal: false, claim_count: 0 },
          { status: 'Devis', auto_renewal: true, claim_count: 0 },
          // Active auto_renewal=true ≤30j → ne doit PAS déclencher renewal-due
          { status: 'Active', end_date: inDays(10), auto_renewal: true, claim_count: 0 },
        ] as CourtierCockpitInput['policies'],
      },
      NOW,
    );
    expect(c.priorities.some((p) => p.id === 'priority:policy-renewal-due')).toBe(true);
    expect(c.priorities.some((p) => p.id === 'priority:quote-to-convert')).toBe(true);
  });

  it('signale crédit en retard de décision et police avec sinistre comme risques', () => {
    const c = buildCourtierCockpit(
      {
        ...base,
        credits: [
          { status: 'En cours', expected_decision_date: inDays(-3) },
        ] as CourtierCockpitInput['credits'],
        policies: [
          { status: 'Active', end_date: inDays(200), auto_renewal: true, claim_count: 1 },
        ] as CourtierCockpitInput['policies'],
      },
      NOW,
    );
    expect(c.risks.some((r) => r.id === 'risk:credit-stale-no-decision')).toBe(true);
    expect(c.risks.some((r) => r.id === 'risk:policy-with-claims')).toBe(true);
  });

  it('propose cross-sell (crédit sans police) et réactivation de prospect', () => {
    const c = buildCourtierCockpit(
      {
        ...base,
        clients: [
          { status: 'Actif', activeCredits: 2, activePolicies: 0 },
          { status: 'Prospect', activeCredits: 0, activePolicies: 0 },
        ] as CourtierCockpitInput['clients'],
      },
      NOW,
    );
    expect(c.opportunities.some((o) => o.id === 'opp:cross-sell-credit-to-uninsured')).toBe(true);
    expect(c.opportunities.some((o) => o.id === 'opp:reactivate-prospect')).toBe(true);
  });

  it('états vides honnêtes sans donnée (aucune carte)', () => {
    const c = buildCourtierCockpit(base, NOW);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
    expect(c.revenueValue).toBe(0);
  });
});
