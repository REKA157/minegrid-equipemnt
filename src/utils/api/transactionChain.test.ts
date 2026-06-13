import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ default: { rpc } }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import {
  createInspectionStep,
  createPaymentStep,
  createFinancingStep,
  createTransportStep,
  createCustomsStep,
  advanceTransactionCaseStep,
} from './transactionChain';

describe('transactionChain — write-side dossier (L3/L4)', () => {
  beforeEach(() => rpc.mockReset());

  it('createInspectionStep appelle la bonne RPC et renvoie l id créé', async () => {
    rpc.mockResolvedValue({ data: 'insp-1', error: null });
    const r = await createInspectionStep('case-1');
    expect(rpc).toHaveBeenCalledWith('create_inspection_step', { p_case_id: 'case-1' });
    expect(r).toEqual({ ok: true, id: 'insp-1', reason: 'created' });
  });

  it('RPC non déployée -> not_deployed (aucun faux succès)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.create_inspection_step(uuid) does not exist' },
    });
    const r = await createInspectionStep('c');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_deployed');
    expect(r.id).toBeNull();
  });

  it('forbidden -> reason forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    expect((await createInspectionStep('c')).reason).toBe('forbidden');
  });

  it('idempotence : 2 appels successifs renvoient le même id (serveur), pas de doublon', async () => {
    rpc.mockResolvedValue({ data: 'insp-1', error: null });
    const a = await createInspectionStep('c');
    const b = await createInspectionStep('c');
    expect(a.id).toBe('insp-1');
    expect(b.id).toBe('insp-1');
  });

  it('createPaymentStep (escrow) appelle create_payment_step', async () => {
    rpc.mockResolvedValue({ data: 'pay-1', error: null });
    await createPaymentStep('c');
    expect(rpc).toHaveBeenCalledWith('create_payment_step', { p_case_id: 'c' });
  });

  it('createFinancingStep transmet le montant', async () => {
    rpc.mockResolvedValue({ data: 'f1', error: null });
    await createFinancingStep('c', 50000);
    expect(rpc).toHaveBeenCalledWith('create_financing_step', { p_case_id: 'c', p_amount: 50000 });
  });

  it('createTransportStep transmet pickup/delivery', async () => {
    rpc.mockResolvedValue({ data: 't1', error: null });
    await createTransportStep('c', 'Casablanca', 'Dakar');
    expect(rpc).toHaveBeenCalledWith('create_transport_step', {
      p_case_id: 'c',
      p_pickup: 'Casablanca',
      p_delivery: 'Dakar',
    });
  });

  it('createCustomsStep transmet origine/destination', async () => {
    rpc.mockResolvedValue({ data: 'cu1', error: null });
    await createCustomsStep('c', 'FR', 'MA');
    expect(rpc).toHaveBeenCalledWith('create_customs_step', {
      p_case_id: 'c',
      p_origin: 'FR',
      p_destination: 'MA',
    });
  });

  it('advanceTransactionCaseStep transmet l étape', async () => {
    rpc.mockResolvedValue({ data: 'x', error: null });
    await advanceTransactionCaseStep('c', 'transport');
    expect(rpc).toHaveBeenCalledWith('advance_transaction_case_step', { p_case_id: 'c', p_step: 'transport' });
  });
});
