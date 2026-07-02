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
  assignTransactionPartner,
  revokeTransactionPartner,
  acceptTransactionInvitation,
  declineTransactionInvitation,
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

describe('transactionChain — réseau partenaire', () => {
  beforeEach(() => rpc.mockReset());

  it('assignTransactionPartner appelle la RPC avec rôle + email et renvoie assigned', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const r = await assignTransactionPartner('case-1', 'mechanic', 'meca@exemple.com');
    expect(rpc).toHaveBeenCalledWith('assign_transaction_partner', {
      p_case_id: 'case-1',
      p_role: 'mechanic',
      p_partner_email: 'meca@exemple.com',
    });
    expect(r).toEqual({ ok: true, id: 'part-1', reason: 'assigned' });
  });

  it('email inconnu -> partner_not_found (anti-façade, aucun acteur fictif)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'partner_not_found' } });
    const r = await assignTransactionPartner('c', 'broker', 'absent@exemple.com');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('partner_not_found');
    expect(r.id).toBeNull();
  });

  it('appelant non autorisé -> forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    expect((await assignTransactionPartner('c', 'carrier', 'x@y.z')).reason).toBe('forbidden');
  });

  it('RPC non déployée -> not_deployed', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.assign_transaction_partner(uuid, text, text) does not exist' },
    });
    expect((await assignTransactionPartner('c', 'forwarder', 'x@y.z')).reason).toBe('not_deployed');
  });

  it('idempotence : ré-assigner le même partenaire renvoie le même id', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const a = await assignTransactionPartner('c', 'mechanic', 'm@e.co');
    const b = await assignTransactionPartner('c', 'mechanic', 'm@e.co');
    expect(a.id).toBe('part-1');
    expect(b.id).toBe('part-1');
  });

  it('revokeTransactionPartner appelle la RPC et renvoie revoked', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const r = await revokeTransactionPartner('case-1', 'part-1');
    expect(rpc).toHaveBeenCalledWith('revoke_transaction_partner', {
      p_case_id: 'case-1',
      p_participant_id: 'part-1',
    });
    expect(r).toEqual({ ok: true, id: 'part-1', reason: 'revoked' });
  });

  it('révoquer une ligne déjà révoquée (data null) -> ok=false sans erreur', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await revokeTransactionPartner('c', 'p');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('revoked');
  });
});

describe('transactionChain — invitation accept/decline (par l invité)', () => {
  beforeEach(() => rpc.mockReset());

  it('acceptTransactionInvitation appelle la RPC et renvoie accepted', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const r = await acceptTransactionInvitation('part-1');
    expect(rpc).toHaveBeenCalledWith('accept_transaction_invitation', { p_participant_id: 'part-1' });
    expect(r).toEqual({ ok: true, id: 'part-1', reason: 'accepted' });
  });

  it('declineTransactionInvitation appelle la RPC et renvoie declined', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const r = await declineTransactionInvitation('part-1');
    expect(rpc).toHaveBeenCalledWith('decline_transaction_invitation', { p_participant_id: 'part-1' });
    expect(r).toEqual({ ok: true, id: 'part-1', reason: 'declined' });
  });

  it('accepter l invitation d un autre -> forbidden (anti-usurpation)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    expect((await acceptTransactionInvitation('p')).reason).toBe('forbidden');
  });

  it('invitation absente -> invitation_not_found', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invitation_not_found' } });
    expect((await acceptTransactionInvitation('p')).reason).toBe('invitation_not_found');
  });

  it('invitation révoquée -> invitation_revoked', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invitation_revoked' } });
    expect((await acceptTransactionInvitation('p')).reason).toBe('invitation_revoked');
  });

  it('RPC non déployée -> not_deployed', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.accept_transaction_invitation(uuid) does not exist' },
    });
    expect((await acceptTransactionInvitation('p')).reason).toBe('not_deployed');
  });

  it('idempotence accept : 2 appels renvoient le même id', async () => {
    rpc.mockResolvedValue({ data: 'part-1', error: null });
    const a = await acceptTransactionInvitation('part-1');
    const b = await acceptTransactionInvitation('part-1');
    expect(a.id).toBe('part-1');
    expect(b.id).toBe('part-1');
  });
});
