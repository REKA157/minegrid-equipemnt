import { describe, it, expect } from 'vitest';
import {
  buildInvestisseurCockpit,
  type InvestisseurCockpitInput,
} from './buildInvestisseurCockpit';

const NOW = new Date('2026-06-13T00:00:00Z').getTime();

// Fabrique un input minimal « vide » ; on surcharge ce qui compte par test.
// Casts `as` autorisés pour brièveté (on ne fournit que les champs lus par le builder).
function makeInput(over: Partial<{
  portfolio: Partial<InvestisseurCockpitInput['portfolio']>;
  opportunities: InvestisseurCockpitInput['opportunities'];
  oppScore: Partial<InvestisseurCockpitInput['oppScore']>;
  risk: Partial<InvestisseurCockpitInput['risk']>;
}> = {}): InvestisseurCockpitInput {
  return {
    portfolio: {
      totalMarketValue: 0,
      totalAcquisition: 0,
      unrealizedGain: 0,
      unrealizedGainPercent: 0,
      realizedGain: 0,
      monthlyNet: 0,
      soldCount: 0,
      activeCount: 0,
      investments: [],
      ...(over.portfolio ?? {}),
    } as InvestisseurCockpitInput['portfolio'],
    opportunities: over.opportunities ?? ([] as InvestisseurCockpitInput['opportunities']),
    oppScore: {
      activeCount: 0,
      avgRoi: 0,
      expiringIn7d: 0,
      recommendBuy: 0,
      highRisk: 0,
      ...(over.oppScore ?? {}),
    } as InvestisseurCockpitInput['oppScore'],
    risk: {
      concentrations: [],
      ageRiskCount: 0,
      financingDependencyPercent: 0,
      lowOccupancyCount: 0,
      ...(over.risk ?? {}),
    } as InvestisseurCockpitInput['risk'],
  };
}

const ids = (arr: { id: string }[]) => arr.map((c) => c.id);

describe('buildInvestisseurCockpit', () => {
  it('headline: valeur de marché + plus-value latente + cash-flow, unité MAD, disponible', () => {
    const out = buildInvestisseurCockpit(
      makeInput({
        portfolio: {
          totalMarketValue: 1_200_000,
          unrealizedGain: 200_000,
          unrealizedGainPercent: 20,
          monthlyNet: 15_000,
        },
      }),
      NOW,
    );
    expect(out.revenueValue).toBe(1_200_000);
    expect(out.revenueUnit).toBe('MAD');
    expect(out.revenueAvailable).toBe(true);
    expect(out.revenueHint).toContain('20 %');
    expect(out.revenueHint.toLowerCase()).toContain('cash-flow');
  });

  it('input vide => aucune carte (états vides honnêtes, anti-façade)', () => {
    const out = buildInvestisseurCockpit(makeInput(), NOW);
    expect(out.priorities).toHaveLength(0);
    expect(out.risks).toHaveLength(0);
    expect(out.opportunities).toHaveLength(0);
  });

  it('priorités: expiring, recommend-buy, exit-window (<60j), low-occupancy', () => {
    const out = buildInvestisseurCockpit(
      makeInput({
        oppScore: { expiringIn7d: 2, recommendBuy: 3, activeCount: 5 },
        risk: { lowOccupancyCount: 1 },
        portfolio: {
          investments: [
            // dans la fenêtre 60j -> compté
            { id: 'a', target_exit_date: '2026-07-01' },
            // au-delà de 60j -> ignoré
            { id: 'b', target_exit_date: '2026-12-01' },
            // pas de date -> ignoré
            { id: 'c', target_exit_date: null },
          ] as InvestisseurCockpitInput['portfolio']['investments'],
        },
      }),
      NOW,
    );
    expect(ids(out.priorities)).toEqual([
      'opp-expiring-7d',
      'opp-recommend-buy',
      'exit-window-due',
      'low-occupancy-assets',
    ]);
    const exit = out.priorities.find((c) => c.id === 'exit-window-due')!;
    expect(exit.label).toContain('1 actif');
  });

  it('risques: concentration >40 %, dépendance financement >50 %, vétusté, pipeline risqué', () => {
    const out = buildInvestisseurCockpit(
      makeInput({
        risk: {
          concentrations: [{ category: 'Pelles', value: 800_000, percent: 55 }],
          financingDependencyPercent: 65,
          ageRiskCount: 2,
        },
        oppScore: { highRisk: 4 },
      }),
      NOW,
    );
    expect(ids(out.risks)).toEqual([
      'concentration-sector',
      'financing-dependency',
      'ageing-fleet',
      'high-risk-pipeline',
    ]);
    expect(out.risks[0].label).toContain('Pelles');
    expect(out.risks[0].label).toContain('55 %');
  });

  it('seuils non franchis: concentration 40 % et financement 50 % => pas de carte risque', () => {
    const out = buildInvestisseurCockpit(
      makeInput({
        risk: {
          concentrations: [{ category: 'Pelles', value: 400_000, percent: 40 }],
          financingDependencyPercent: 50,
        },
      }),
      NOW,
    );
    expect(ids(out.risks)).not.toContain('concentration-sector');
    expect(ids(out.risks)).not.toContain('financing-dependency');
  });

  it('opportunités: best-roi, diversifying, redeploy, undervalued', () => {
    const out = buildInvestisseurCockpit(
      makeInput({
        opportunities: [
          { id: 'o1', equipment_label: 'Bull D6', category: 'Bulldozers', expected_roi_percent: 22, asking_price: 90, estimated_market_value: 120 },
          { id: 'o2', equipment_label: 'Pelle 320', category: 'Pelles', expected_roi_percent: 15, asking_price: 200, estimated_market_value: 180 },
        ] as InvestisseurCockpitInput['opportunities'],
        oppScore: { activeCount: 2, avgRoi: 18 },
        portfolio: { realizedGain: 150_000 },
        risk: {
          concentrations: [{ category: 'Pelles', value: 800_000, percent: 60 }],
        },
      }),
      NOW,
    );
    expect(ids(out.opportunities)).toEqual([
      'best-roi-opportunity',
      'diversifying-opportunity',
      'realized-vs-pipeline-redeploy',
      'undervalued-opportunity',
    ]);
    expect(out.opportunities[0].label).toContain('Bull D6');
    // diversifying ne compte que l'opportunité hors « Pelles » (o1)
    expect(out.opportunities[1].label).toContain('1 opportunité');
    // undervalued ne compte que o1 (90 < 120), pas o2 (200 > 180)
    const uv = out.opportunities.find((c) => c.id === 'undervalued-opportunity')!;
    expect(uv.label).toContain('1 opportunité');
  });
});
