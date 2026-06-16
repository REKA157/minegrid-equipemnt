import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaseRisk } from '../risk/caseRiskService';

// Toutes les sources réelles sont mockées -> on teste UNIQUEMENT la logique d'agrégation,
// de façon déterministe, sans toucher à Supabase.
const h = vi.hoisted(() => ({
  getLeads: vi.fn(),
  loadCaseRisks: vi.fn(),
  buildNetworkForRole: vi.fn(),
  loadListingViewGaps: vi.fn(),
}));
vi.mock('../../services/realPipelineService', () => ({ RealPipelineService: { getLeads: h.getLeads } }));
vi.mock('../risk/caseRiskService', () => ({ loadCaseRisks: h.loadCaseRisks }));
vi.mock('../partner/partnerPerformanceService', () => ({ buildNetworkForRole: h.buildNetworkForRole }));
vi.mock('./listingInsights', () => ({ loadListingViewGaps: h.loadListingViewGaps }));

import { buildRecommendations } from './recommendationsService';

const OLD = '2020-01-01T00:00:00Z'; // last_contact ancien -> staleness max (déterministe)
const emptyNet = { best: null, ranked: [], saturated: [], toAvoid: [] };

beforeEach(() => {
  h.getLeads.mockReset().mockResolvedValue([]);
  h.loadCaseRisks.mockReset().mockResolvedValue([]);
  h.buildNetworkForRole.mockReset().mockResolvedValue(emptyNet);
  h.loadListingViewGaps.mockReset().mockResolvedValue([]);
});

const risk = (caseId: string, level: 'high' | 'medium', score: number): CaseRisk => ({
  caseId,
  title: `Dossier ${caseId}`,
  risk: { level, score, signals: [{ code: 'x', label: 'Litige', severity: level }] },
});

describe('recommendationsService — agrégateur réel (anti-façade)', () => {
  it('aucune donnée -> [] (aucun insight inventé)', async () => {
    expect(await buildRecommendations()).toEqual([]);
  });

  it('lead en retard -> insight RELANCE', async () => {
    // Stage non-chaud + dernier contact très ancien -> action "Relancer".
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'Pelle 320D', stage: 'Qualification', value: 0, probability: 0, last_contact: OLD, source: 'message', transaction_case_id: null },
    ]);
    const out = await buildRecommendations();
    const reco = out.find((r) => r.id === 'leads:stale');
    expect(reco).toBeDefined();
    expect(reco!.action).toBe('Relancer');
    expect(reco!.href).toBe('#leads');
    expect(reco!.source).toMatch(/Leads/);
  });

  it('opportunité chaude sans dossier -> reco vers #leads', async () => {
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'Pelle 320D', stage: 'Devis', value: 500000, probability: 90, last_contact: OLD, source: 'message', transaction_case_id: null },
    ]);
    const out = await buildRecommendations();
    const reco = out.find((r) => r.id === 'lead:l1');
    expect(reco).toBeDefined();
    expect(reco!.href).toBe('#leads');
  });

  it('risque réel -> insight RISQUE vers #dossier/{id}', async () => {
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]);
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1');
    expect(out[0].href).toBe('#dossier/c1');
    expect(out[0].action).toBe('Vérifier avant escrow');
    expect(out[0].priority).toBe('urgent');
  });

  it('partenaire saturé -> insight RÉASSIGNATION', async () => {
    // 1er rôle interrogé renvoie un partenaire saturé, les autres rien.
    h.buildNetworkForRole.mockResolvedValueOnce({ ...emptyNet, saturated: [{ partnerId: 'p1' }] });
    const out = await buildRecommendations();
    const reco = out.find((r) => r.id.startsWith('partner:'));
    expect(reco).toBeDefined();
    expect(reco!.action).toMatch(/Réassigner/);
    expect(reco!.source).toMatch(/Partner Network/);
  });

  it('machine très vue sans devis -> insight OPTIMISATION', async () => {
    h.loadListingViewGaps.mockResolvedValue([{ machineId: 'm1', title: 'Pelle 320', views: 25 }]);
    const out = await buildRecommendations();
    const reco = out.find((r) => r.id === 'listing:m1');
    expect(reco).toBeDefined();
    expect(reco!.action).toBe("Améliorer l'annonce");
    expect(reco!.href).toBe('#machines/m1');
    expect(reco!.title).toMatch(/25 vues/);
  });

  it('tri : urgent (risque) avant les recos high (lead)', async () => {
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'L', stage: 'Devis', value: 0, probability: 0, last_contact: OLD, source: 'message', transaction_case_id: null }, // high
    ]);
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]); // urgent
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1'); // urgent en premier
    expect(out[0].priority).toBe('urgent');
  });
});
