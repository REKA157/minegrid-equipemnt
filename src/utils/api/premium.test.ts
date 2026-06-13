import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks hoistés (cf. subscription.test.ts) : on isole premium.ts de Supabase et
// des dépendances pour vérifier l'absence de contournement de paiement côté client.
const { getCurrentUser, createNotification, single, insertMock, fromMock } = vi.hoisted(() => {
  const single = vi.fn();
  const insertMock = vi.fn();
  const eqStatus = vi.fn(() => ({ single }));
  const eqUser = vi.fn(() => ({ eq: eqStatus }));
  const selectMock = vi.fn(() => ({ eq: eqUser }));
  const fromMock = vi.fn(() => ({ select: selectMock, insert: insertMock }));
  const getCurrentUser = vi.fn();
  const createNotification = vi.fn();
  return { getCurrentUser, createNotification, single, insertMock, fromMock };
});

vi.mock('../supabaseClient', () => ({ default: { from: fromMock } }));
vi.mock('./auth', () => ({ getCurrentUser }));
vi.mock('./notifications', () => ({ createNotification }));

import { getPremiumService, requestPremiumService } from './premium';

describe('premium.ts — anti-façade & anti-contournement de paiement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    createNotification.mockResolvedValue(undefined);
  });

  it("getPremiumService renvoie null si aucune ligne réelle (plus de faux service 'active')", async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const result = await getPremiumService();
    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledWith('premium_services');
  });

  it('getPremiumService renvoie la ligne réelle quand elle existe', async () => {
    const row = { id: 'real-1', user_id: 'u1', service_type: 'premium', status: 'active' };
    single.mockResolvedValue({ data: row, error: null });
    const result = await getPremiumService();
    expect(result).toEqual(row);
  });

  it("requestPremiumService n'écrit JAMAIS un service 'active' côté client (demande 'pending')", async () => {
    insertMock.mockResolvedValue({ data: [{ id: 'req-1' }], error: null });

    await requestPremiumService('premium');

    expect(insertMock).toHaveBeenCalledTimes(1);
    // insert([serviceData]) -> calls[0][0] est le tableau, [0] son premier élément.
    const inserted = insertMock.mock.calls[0][0][0];
    expect(inserted.status).toBe('pending');
    expect(inserted.status).not.toBe('active');
    expect(inserted.user_id).toBe('u1');
  });
});
