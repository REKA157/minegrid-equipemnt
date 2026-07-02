import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaseRisk } from '../risk/caseRiskService';

// Toutes les sources réelles sont mockées -> on teste UNIQUEMENT l'agrégation des 7
// familles, de façon déterministe, sans toucher à Supabase.
const h = vi.hoisted(() => ({
  getLeads: vi.fn(),
  loadCaseRisks: vi.fn(),
  loadListingViewGaps: vi.fn(),
  loadQuotesWithoutCase: vi.fn(),
  loadStaleQuotes: vi.fn(),
  loadPartnerAssignmentInsights: vi.fn(),
  loadMarketProjectMatches: vi.fn(),
}));
vi.mock('../../services/realPipelineService', () => ({ RealPipelineService: { getLeads: h.getLeads } }));
vi.mock('../risk/caseRiskService', () => ({ loadCaseRisks: h.loadCaseRisks }));
vi.mock('./listingInsights', () => ({ loadListingViewGaps: h.loadListingViewGaps }));
vi.mock('./quoteInsights', () => ({ loadQuotesWithoutCase: h.loadQuotesWithoutCase, loadStaleQuotes: h.loadStaleQuotes }));
vi.mock('./partnerAssignmentInsights', () => ({ loadPartnerAssignmentInsights: h.loadPartnerAssignmentInsights }));
vi.mock('./marketProjectInsights', () => ({ loadMarketProjectMatches: h.loadMarketProjectMatches }));

import { buildRecommendations } from './recommendationsService';

const OLD = '2020-01-01T00:00:00Z';
const EMPTY_STALE = { count: 0, oldestMachineId: null, oldestDays: 0 };
const EMPTY_PARTNER = { gaps: [], saturations: [] };

beforeEach(() => {
  h.getLeads.mockReset().mockResolvedValue([]);
  h.loadCaseRisks.mockReset().mockResolvedValue([]);
  h.loadListingViewGaps.mockReset().mockResolvedValue([]);
  h.loadQuotesWithoutCase.mockReset().mockResolvedValue([]);
  h.loadStaleQuotes.mockReset().mockResolvedValue(EMPTY_STALE);
  h.loadPartnerAssignmentInsights.mockReset().mockResolvedValue(EMPTY_PARTNER);
  h.loadMarketProjectMatches.mockReset().mockResolvedValue([]);
});

const risk = (caseId: string, level: 'high' | 'medium', score: number): CaseRisk => ({
  caseId,
  title: `Dossier ${caseId}`,
  risk: { level, score, signals: [{ code: 'x', label: 'Litige', severity: level }] },
});

describe('recommendationsService — moteur "quoi faire maintenant" (anti-façade)', () => {
  it('aucune donnée -> [] (aucun insight inventé)', async () => {
    expect(await buildRecommendations()).toEqual([]);
  });

  it('#1 annonce très vue sans devis -> optimisation', async () => {
    h.loadListingViewGaps.mockResolvedValue([{ machineId: 'm1', title: 'Pelle 320', views: 25 }]);
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'listing:m1');
    expect(r).toBeDefined();
    expect(r!.href).toBe('#machines/m1');
    expect(r!.action).toMatch(/Améliorer l'annonce/);
  });

  it('#2 devis reçu sans dossier -> créer le dossier', async () => {
    h.loadQuotesWithoutCase.mockResolvedValue([{ machineId: 'm2', title: 'CAT 320D', quoteCount: 2 }]);
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'quote-case:m2');
    expect(r).toBeDefined();
    expect(r!.action).toBe('Créer le dossier transaction');
    expect(r!.href).toBe('#machines/m2');
  });

  it('#3a lead en retard -> relance', async () => {
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'Pelle', stage: 'Qualification', value: 0, probability: 0, last_contact: OLD, source: 'message', transaction_case_id: null },
    ]);
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'leads:stale');
    expect(r).toBeDefined();
    expect(r!.action).toBe('Relancer');
  });

  it('#3b devis sans réponse -> relance (urgent si > 14 j)', async () => {
    h.loadStaleQuotes.mockResolvedValue({ count: 3, oldestMachineId: 'm5', oldestDays: 20 });
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'quotes:stale');
    expect(r).toBeDefined();
    expect(r!.priority).toBe('urgent');
    expect(r!.href).toBe('#machines/m5');
  });

  it('#4 partenaire recommandé non assigné -> assigner', async () => {
    h.loadPartnerAssignmentInsights.mockResolvedValue({
      gaps: [{ caseId: 'c1', title: 'Pelle CAT', role: 'mechanic', roleLabel: 'mécanicien (inspection)' }],
      saturations: [],
    });
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'partner-gap:c1:mechanic');
    expect(r).toBeDefined();
    expect(r!.action).toMatch(/Assigner le meilleur partenaire/);
    expect(r!.href).toBe('#dossier/c1');
  });

  it('#5 partenaire saturé déjà assigné -> réassigner', async () => {
    h.loadPartnerAssignmentInsights.mockResolvedValue({
      gaps: [],
      saturations: [{ caseId: 'c2', title: 'Niveleuse', role: 'carrier', roleLabel: 'transporteur', partnerId: 'p9' }],
    });
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'partner-sat:c2:carrier');
    expect(r).toBeDefined();
    expect(r!.action).toMatch(/Réassigner/);
    expect(r!.href).toBe('#dossier/c2');
  });

  it('#6 risque réel -> vérifier avant escrow', async () => {
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]);
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1');
    expect(out[0].action).toBe('Vérifier avant escrow');
    expect(out[0].priority).toBe('urgent');
  });

  it('#7 projet Global Monitor compatible -> proposer la machine', async () => {
    h.loadMarketProjectMatches.mockResolvedValue([
      { projectId: 'pr1', projectTitle: 'Mine', machineId: 'm7', machineTitle: 'Pelle 320' },
    ]);
    const out = await buildRecommendations();
    const r = out.find((x) => x.id === 'project:pr1:m7');
    expect(r).toBeDefined();
    expect(r!.href).toBe('#machines/m7');
  });

  it('tri : urgent (risque) avant high (annonce)', async () => {
    h.loadListingViewGaps.mockResolvedValue([{ machineId: 'm1', title: 'Pelle', views: 25 }]); // high
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]); // urgent
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1');
    expect(out[0].priority).toBe('urgent');
  });
});
