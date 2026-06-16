import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  listAccessibleTransactionCases: vi.fn(),
  listTransactionEvents: vi.fn(),
  listByCase: vi.fn(),
  listRequestsByCase: vi.fn(),
}));
vi.mock('../api/transactionCases', () => ({
  listAccessibleTransactionCases: h.listAccessibleTransactionCases,
  listTransactionEvents: h.listTransactionEvents,
}));
vi.mock('../api/transactionPlatform', () => ({
  paymentRecordService: { listByCase: h.listByCase },
  inspectionService: { listRequestsByCase: h.listRequestsByCase },
}));

import { loadCaseRisks } from './caseRiskService';

beforeEach(() => {
  h.listAccessibleTransactionCases.mockReset();
  h.listTransactionEvents.mockReset().mockResolvedValue([]);
  h.listByCase.mockReset().mockResolvedValue([]);
  h.listRequestsByCase.mockReset().mockResolvedValue([]);
});

describe('caseRiskService — agrégation risque dossier (anti-façade)', () => {
  it('aucun dossier -> [] (rien d inventé)', async () => {
    h.listAccessibleTransactionCases.mockResolvedValue([]);
    expect(await loadCaseRisks()).toEqual([]);
  });

  it('exclut les dossiers sans signal (low), inclut ceux à risque réel', async () => {
    h.listAccessibleTransactionCases.mockResolvedValue([
      { id: 'c1', title: 'Sain' },
      { id: 'c2', title: 'Litige' },
    ]);
    h.listByCase.mockImplementation((id: string) =>
      Promise.resolve(id === 'c2' ? [{ status: 'disputed', amount: 1000, payment_type: 'escrow' }] : []),
    );
    const out = await loadCaseRisks();
    expect(out.map((r) => r.caseId)).toEqual(['c2']); // c1 (aucun signal -> low) exclu
    expect(out[0].risk.level).toBe('high');
  });

  it('trie par score décroissant puis caseId (déterministe)', async () => {
    h.listAccessibleTransactionCases.mockResolvedValue([
      { id: 'b', title: 'B' },
      { id: 'a', title: 'A' },
    ]);
    h.listByCase.mockResolvedValue([{ status: 'disputed', amount: 1, payment_type: 'escrow' }]); // même score
    const out = await loadCaseRisks();
    expect(out.map((r) => r.caseId)).toEqual(['a', 'b']); // tie-break caseId asc
  });

  it('échec API -> [] (anti-façade : pas de faux risque)', async () => {
    h.listAccessibleTransactionCases.mockRejectedValue(new Error('boom'));
    expect(await loadCaseRisks()).toEqual([]);
  });
});
