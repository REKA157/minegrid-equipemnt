import { describe, it, expect } from 'vitest';
import { buildFinancierCockpit, type FinancierCockpitInput } from './buildFinancierCockpit';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();
const iso = (offsetDays: number): string =>
  new Date(NOW + offsetDays * 86_400_000).toISOString().slice(0, 10);

const base: FinancierCockpitInput = {
  rentalRevenue: { revenue: 0, count: 0, growth: 0 },
  upcomingRentals: [],
  pipeline: [],
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
  credits: [],
  policies: [],
  clients: [],
  performance: [],
  cases: [],
} as unknown as FinancierCockpitInput;

describe('buildFinancierCockpit', () => {
  it('headline consolide revenus location + commissions du mois en MAD', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        rentalRevenue: { revenue: 40000, count: 2, growth: 15 },
        commissions: { ...base.commissions, monthCommission: 12000 },
      },
      NOW,
    );
    expect(c.revenueValue).toBe(52000);
    expect(c.revenueUnit).toBe('MAD');
    expect(c.revenueAvailable).toBe(true);
    expect(c.revenueHint).toContain('+15%');
  });

  it('priorite : credit approuve non decaisse + location imminente + dossier paiement', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        credits: [{ status: 'Approuvé', disbursement_date: null }] as unknown as FinancierCockpitInput['credits'],
        upcomingRentals: [{ priority: 'urgent' }] as unknown as FinancierCockpitInput['upcomingRentals'],
        cases: [{ status: 'payment' }, { status: 'draft' }] as unknown as FinancierCockpitInput['cases'],
      },
      NOW,
    );
    expect(c.priorities.some((p) => p.id === 'fin:credit-approuve-non-decaisse')).toBe(true);
    expect(c.priorities.some((p) => p.id === 'fin:locations-encaissement-imminent')).toBe(true);
    const dossier = c.priorities.find((p) => p.id === 'fin:dossiers-etape-paiement');
    expect(dossier?.href).toBe('#dossiers');
    expect(dossier?.label).toContain('1 dossier');
  });

  it('credit deja decaisse ou dossier non-paiement => aucune priorite', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        credits: [{ status: 'Approuvé', disbursement_date: '2026-06-01' }] as unknown as FinancierCockpitInput['credits'],
        cases: [{ status: 'logistics' }] as unknown as FinancierCockpitInput['cases'],
      },
      NOW,
    );
    expect(c.priorities).toHaveLength(0);
  });

  it('risques : police expirant <30j et credit en retard de decision', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        policies: [
          { status: 'Active', end_date: iso(10) },
          { status: 'Active', end_date: iso(90) },
        ] as unknown as FinancierCockpitInput['policies'],
        credits: [
          { status: 'En cours', expected_decision_date: iso(-5) },
        ] as unknown as FinancierCockpitInput['credits'],
      },
      NOW,
    );
    const pol = c.risks.find((r) => r.id === 'fin:polices-expirant-impaye');
    expect(pol?.label).toContain('1 police');
    expect(c.risks.some((r) => r.id === 'fin:credits-decision-en-retard')).toBe(true);
  });

  it('risque concentration : part du client dominant calculee', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        clients: [
          { name: 'Alpha', totalCreditVolume: 750000, activeCredits: 1, activePolicies: 0 },
          { name: 'Beta', totalCreditVolume: 250000, activeCredits: 1, activePolicies: 0 },
        ] as unknown as FinancierCockpitInput['clients'],
      },
      NOW,
    );
    const conc = c.risks.find((r) => r.id === 'fin:concentration-encaissement-client');
    expect(conc?.detail).toContain('Alpha');
    expect(conc?.detail).toContain('75%');
  });

  it('opportunites : tendance commissions, pipeline negociation, prospects dormants', () => {
    const c = buildFinancierCockpit(
      {
        ...base,
        performance: [{ total: 5000, credit: 4000, assurance: 1000 }] as unknown as FinancierCockpitInput['performance'],
        pipeline: [{ stage: 'Négociation', value: 30000 }] as unknown as FinancierCockpitInput['pipeline'],
        clients: [
          { name: 'Dormant', totalCreditVolume: 0, activeCredits: 0, activePolicies: 0 },
        ] as unknown as FinancierCockpitInput['clients'],
      },
      NOW,
    );
    const trend = c.opportunities.find((o) => o.id === 'fin:tendance-commissions-6mois');
    expect(trend?.detail).toContain('crédit');
    expect(c.opportunities.some((o) => o.id === 'fin:pipeline-location-a-convertir')).toBe(true);
    expect(c.opportunities.some((o) => o.id === 'fin:prospects-portefeuille-a-activer')).toBe(true);
  });

  it('input vide => listes vides mais headline disponible', () => {
    const c = buildFinancierCockpit(base, NOW);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
    expect(c.revenueAvailable).toBe(true);
    expect(c.revenueValue).toBe(0);
  });
});
