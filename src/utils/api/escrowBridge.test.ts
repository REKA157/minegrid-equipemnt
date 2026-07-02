import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ default: { rpc } }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { openCaseEscrow, linkCaseToEscrow } from './escrowBridge';

describe('escrowBridge — pont payment_records <-> escrow_transactions', () => {
  beforeEach(() => rpc.mockReset());

  it('openCaseEscrow appelle la bonne RPC et renvoie opened', async () => {
    rpc.mockResolvedValue({ data: 'escrow-1', error: null });
    const r = await openCaseEscrow('case-1');
    expect(rpc).toHaveBeenCalledWith('open_case_escrow', { p_case_id: 'case-1' });
    expect(r).toEqual({ ok: true, id: 'escrow-1', reason: 'opened' });
  });

  it('linkCaseToEscrow transmet case + escrow et renvoie linked', async () => {
    rpc.mockResolvedValue({ data: 'escrow-1', error: null });
    const r = await linkCaseToEscrow('case-1', 'escrow-1');
    expect(rpc).toHaveBeenCalledWith('link_case_to_escrow', { p_case_id: 'case-1', p_escrow_id: 'escrow-1' });
    expect(r).toEqual({ ok: true, id: 'escrow-1', reason: 'linked' });
  });

  it('anti-façade : escrow sans acheteur -> buyer_required', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'buyer_required' } });
    expect((await openCaseEscrow('c')).reason).toBe('buyer_required');
  });

  it('anti-façade : escrow sans montant -> amount_required', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'amount_required' } });
    expect((await openCaseEscrow('c')).reason).toBe('amount_required');
  });

  it('escrow déjà lié -> escrow_already_linked', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'escrow_already_linked' } });
    expect((await linkCaseToEscrow('c', 'e')).reason).toBe('escrow_already_linked');
  });

  it('non partie prenante -> forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    expect((await linkCaseToEscrow('c', 'e')).reason).toBe('forbidden');
  });

  it('RPC non déployée -> not_deployed (aucun faux succès)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.open_case_escrow(uuid) does not exist' },
    });
    expect((await openCaseEscrow('c')).reason).toBe('not_deployed');
  });

  it('idempotence : 2 ouvertures renvoient le même escrow', async () => {
    rpc.mockResolvedValue({ data: 'escrow-1', error: null });
    const a = await openCaseEscrow('c');
    const b = await openCaseEscrow('c');
    expect(a.id).toBe('escrow-1');
    expect(b.id).toBe('escrow-1');
  });
});
