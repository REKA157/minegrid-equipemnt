import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ default: { rpc } }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { ensureTransactionCaseForQuote } from './quoteRequests';

describe('ensureTransactionCaseForQuote (activation CTA dossier depuis LeadsInbox)', () => {
  beforeEach(() => rpc.mockReset());

  it('appelle la RPC existante et renvoie le caseId créé', async () => {
    rpc.mockResolvedValue({ data: 'case-1', error: null });
    const r = await ensureTransactionCaseForQuote('quote-1');
    expect(rpc).toHaveBeenCalledWith('ensure_transaction_case_for_quote_request', {
      p_quote_request_id: 'quote-1',
    });
    expect(r).toEqual({ ok: true, caseId: 'case-1', reason: 'created' });
  });

  it('RPC absente -> not_deployed (aucun faux dossier)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.ensure_transaction_case_for_quote_request(uuid) does not exist' },
    });
    const r = await ensureTransactionCaseForQuote('q');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_deployed');
  });

  it('RLS -> forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    expect((await ensureTransactionCaseForQuote('q')).reason).toBe('forbidden');
  });

  it('idempotence : un 2e appel renvoie le même dossier', async () => {
    rpc.mockResolvedValue({ data: 'case-1', error: null });
    expect((await ensureTransactionCaseForQuote('q')).caseId).toBe('case-1');
    expect((await ensureTransactionCaseForQuote('q')).caseId).toBe('case-1');
  });
});
