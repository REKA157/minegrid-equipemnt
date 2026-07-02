import { describe, it, expect } from 'vitest';
import { rankSalesOpportunities, type OpportunityInput } from './salesOpportunities';
import type { EquipmentNeed, ProjectContact } from '../types/monitor';

const NOW = new Date('2026-07-02T00:00:00Z').getTime();
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function need(label: string, qty = 2): EquipmentNeed {
  return {
    id: `need-${label}`,
    category: label,
    qty_min: qty,
    qty_max: qty,
    confidence: 0.8,
    rationale: null,
    created_at: '2026-01-01',
    marketplace_label: label,
  };
}

function contact(role: string): ProjectContact {
  return {
    id: `c-${role}`,
    organization: 'Org',
    person_name: null,
    role,
    email: null,
    phone: null,
    website: null,
    address: null,
    confidence: 0.7,
    rationale: null,
    created_at: '2026-01-01',
  };
}

function project(id: string, over: Partial<OpportunityInput>): OpportunityInput {
  return {
    id,
    title: id,
    type: 'road',
    phase: 'tender',
    country: 'Morocco',
    region: null,
    lat: null,
    lon: null,
    budget_usd: null,
    start_date: null,
    end_date: null,
    source: 'ocds',
    source_url: null,
    fingerprint: id,
    confidence: 0.7,
    updated_at: null,
    equipment_needs: [],
    contacts: [],
    ...over,
  };
}

const STOCK = ['Pelle Caterpillar 320', 'Chargeuse Volvo L150H'];

describe('rankSalesOpportunities', () => {
  it('exclut les projets sans besoin couvert par le stock, et ceux sans besoin', () => {
    const projects = [
      project('match', { equipment_needs: [need('Pelle hydraulique')] }),
      project('nomatch', { equipment_needs: [need('Grue mobile')] }), // stock n'a pas de grue
      project('noneeds', { equipment_needs: [] }),
    ];
    const res = rankSalesOpportunities(projects, STOCK, { now: NOW });
    expect(res.map((o) => o.project.id)).toEqual(['match']);
    expect(res[0].match.needsCovered).toBe(1);
  });

  it('classe par score : couverture + budget + urgence + rôle', () => {
    const strong = project('strong', {
      equipment_needs: [need('Pelle hydraulique'), need('Chargeuse')],
      budget_usd: 8_000_000,
      end_date: inDays(20),
      contacts: [contact("maître d'ouvrage")],
    });
    const weak = project('weak', {
      equipment_needs: [need('Pelle hydraulique'), need('Grue')], // 1/2 couvert
      budget_usd: 150_000,
      end_date: inDays(200),
      contacts: [],
    });
    const res = rankSalesOpportunities([weak, strong], STOCK, { now: NOW });
    expect(res.map((o) => o.project.id)).toEqual(['strong', 'weak']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
    expect(res[0].coverage).toBe(1);
    expect(res[1].coverage).toBe(0.5);
    expect(res[0].kind).toBe('buyer');
  });

  it('budget invalide (string) ne casse rien et n\'ajoute pas de points', () => {
    const p = project('p', {
      equipment_needs: [need('Pelle hydraulique')],
      budget_usd: 'N/A' as unknown as number,
      end_date: inDays(10),
    });
    const res = rankSalesOpportunities([p], STOCK, { now: NOW });
    expect(res).toHaveLength(1);
    expect(res[0].budgetUsd).toBeNull();
    expect(Number.isFinite(res[0].score)).toBe(true);
  });

  it('respecte l\'option limit', () => {
    const projects = Array.from({ length: 5 }, (_, i) =>
      project(`p${i}`, { equipment_needs: [need('Pelle hydraulique')], budget_usd: (i + 1) * 1_000_000 }),
    );
    const res = rankSalesOpportunities(projects, STOCK, { now: NOW, limit: 2 });
    expect(res).toHaveLength(2);
  });

  it('échéance passée -> pas de bonus urgence (score plus bas qu\'une échéance proche)', () => {
    const soon = project('soon', { equipment_needs: [need('Pelle hydraulique')], end_date: inDays(15) });
    const past = project('past', { equipment_needs: [need('Pelle hydraulique')], end_date: inDays(-15) });
    const res = rankSalesOpportunities([past, soon], STOCK, { now: NOW });
    const soonO = res.find((o) => o.project.id === 'soon')!;
    const pastO = res.find((o) => o.project.id === 'past')!;
    expect(soonO.score).toBeGreaterThan(pastO.score);
  });
});
