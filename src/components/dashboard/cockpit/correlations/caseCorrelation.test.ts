import { describe, it, expect } from 'vitest';
import { buildDossierStageSignals } from './caseCorrelation';
import type { TransactionCaseRow } from '../../../../utils/api/transactionCases';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

const c = (over: Partial<TransactionCaseRow>): TransactionCaseRow =>
  ({
    id: 'c1',
    kind: 'sale',
    status: 'draft',
    machine_id: 'm1',
    seller_user_id: 's1',
    buyer_user_id: 'b1',
    primary_quote_request_id: null,
    primary_lead_id: null,
    title: 'Dossier',
    notes: null,
    created_by: 'b1',
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    closed_at: null,
    ...over,
  }) as TransactionCaseRow;

describe('buildDossierStageSignals (M2 dossier → action)', () => {
  it('aucun dossier → aucune carte', () => {
    const out = buildDossierStageSignals([], NOW);
    expect(out.priorities).toHaveLength(0);
    expect(out.risks).toHaveLength(0);
  });

  it('dossiers draft/qualified → carte à qualifier', () => {
    const out = buildDossierStageSignals([c({ status: 'draft' }), c({ status: 'qualified' })], NOW);
    expect(out.priorities.find((p) => p.id === 'corr:case-qualify')?.label).toContain('2');
  });

  it('dossier en négociation → carte négociation', () => {
    const out = buildDossierStageSignals([c({ status: 'negotiation' })], NOW);
    expect(out.priorities.some((p) => p.id === 'corr:case-negotiation')).toBe(true);
  });

  it('dossier sans activité 14j+ → risque', () => {
    const old = new Date(NOW - 20 * 86_400_000).toISOString();
    const out = buildDossierStageSignals([c({ status: 'negotiation', updated_at: old })], NOW);
    expect(out.risks.some((r) => r.id === 'corr:case-stale')).toBe(true);
  });

  it('dossier clos → ignoré', () => {
    const out = buildDossierStageSignals([c({ status: 'closed' })], NOW);
    expect(out.priorities).toHaveLength(0);
    expect(out.risks).toHaveLength(0);
  });
});
