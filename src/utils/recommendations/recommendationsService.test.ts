import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CaseRisk } from '../risk/caseRiskService';

const h = vi.hoisted(() => ({ getLeads: vi.fn(), loadCaseRisks: vi.fn() }));
vi.mock('../../services/realPipelineService', () => ({ RealPipelineService: { getLeads: h.getLeads } }));
vi.mock('../risk/caseRiskService', () => ({ loadCaseRisks: h.loadCaseRisks }));

import { buildRecommendations } from './recommendationsService';

const OLD = '2020-01-01T00:00:00Z'; // last_contact ancien -> staleness max (déterministe)

beforeEach(() => {
  h.getLeads.mockReset().mockResolvedValue([]);
  h.loadCaseRisks.mockReset().mockResolvedValue([]);
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

  it('lead chaud -> reco vers #leads', async () => {
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'Pelle 320D', stage: 'Devis', value: 500000, probability: 90, last_contact: OLD, source: 'message', transaction_case_id: null },
    ]);
    const out = await buildRecommendations();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('lead:l1');
    expect(out[0].href).toBe('#leads');
  });

  it('risque dossier -> reco vers #dossier/{id}', async () => {
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]);
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1');
    expect(out[0].href).toBe('#dossier/c1');
    expect(out[0].tone).toBe('urgent');
  });

  it('tri : urgent (risque) avant warn (lead high)', async () => {
    h.getLeads.mockResolvedValue([
      { id: 'l1', title: 'L', stage: 'Devis', value: 0, probability: 0, last_contact: OLD, source: 'message', transaction_case_id: null }, // high -> warn
    ]);
    h.loadCaseRisks.mockResolvedValue([risk('c1', 'high', 80)]); // urgent
    const out = await buildRecommendations();
    expect(out[0].id).toBe('risk:c1'); // urgent en premier
    expect(out[0].tone).toBe('urgent');
  });
});
