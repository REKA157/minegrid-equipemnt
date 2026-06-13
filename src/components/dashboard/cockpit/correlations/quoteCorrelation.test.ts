import { describe, it, expect } from 'vitest';
import { buildQuoteSignals } from './quoteCorrelation';
import type { QuoteRequestRow } from '../../../../utils/api/quoteRequests';

const q = (over: Partial<QuoteRequestRow>): QuoteRequestRow =>
  ({
    id: 'q1',
    machine_id: 'm1',
    machine_name: 'CAT 320',
    buyer_name: 'Acheteur',
    buyer_email: 'a@b.co',
    status: 'new',
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
    ...over,
  }) as QuoteRequestRow;

describe('buildQuoteSignals (M1 devis → action)', () => {
  it('aucune donnée → aucune carte', () => {
    const out = buildQuoteSignals([]);
    expect(out.priorities).toHaveLength(0);
    expect(out.opportunities).toHaveLength(0);
  });

  it('devis neufs → priorité urgente', () => {
    const out = buildQuoteSignals([q({ id: 'a' }), q({ id: 'b' })]);
    expect(out.priorities[0]?.id).toBe('corr:quotes-new');
    expect(out.priorities[0]?.label).toContain('2');
    expect(out.priorities[0]?.tone).toBe('urgent');
  });

  it('devis en cours (pas neuf) → priorité relance', () => {
    const out = buildQuoteSignals([q({ status: 'contacted' })]);
    expect(out.priorities[0]?.id).toBe('corr:quotes-open');
  });

  it('devis lié à un dossier → opportunité (cross-module)', () => {
    const out = buildQuoteSignals([q({ status: 'qualified', transaction_case_id: 'case-1' })]);
    expect(out.opportunities[0]?.id).toBe('corr:quotes-case');
    expect(out.opportunities[0]?.href).toBe('#dossiers');
  });

  it('devis clos → ignoré', () => {
    const out = buildQuoteSignals([q({ status: 'closed', transaction_case_id: 'case-1' })]);
    expect(out.priorities).toHaveLength(0);
    expect(out.opportunities).toHaveLength(0);
  });
});
