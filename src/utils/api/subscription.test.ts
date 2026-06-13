import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUser, single, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const single = vi.fn();
  const eqMock = vi.fn(() => ({ single }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const getUser = vi.fn();
  return { getUser, single, eqMock, selectMock, fromMock };
});

vi.mock('../supabaseClient', () => ({
  default: { auth: { getUser }, from: fromMock },
}));

import { getMySubscription, hasEnterprise } from './subscription';

const inFuture = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const inPast = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe('getMySubscription — état dérivé du serveur, jamais de localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('inactif si non connecté', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(s.type).toBeNull();
  });

  it('actif si statut active et non expiré', async () => {
    single.mockResolvedValue({
      data: { subscription_type: 'enterprise', subscription_status: 'active', subscription_end: inFuture() },
      error: null,
    });
    const s = await getMySubscription();
    expect(s.isActive).toBe(true);
    expect(s.type).toBe('enterprise');
    expect(hasEnterprise(s)).toBe(true);
  });

  it('inactif si abonnement expiré (même statut active)', async () => {
    single.mockResolvedValue({
      data: { subscription_type: 'pro', subscription_status: 'active', subscription_end: inPast() },
      error: null,
    });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(s.type).toBeNull();
  });

  it('inactif si statut non actif', async () => {
    single.mockResolvedValue({
      data: { subscription_type: 'pro', subscription_status: 'inactive', subscription_end: inFuture() },
      error: null,
    });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
  });

  it('inactif si aucune ligne / erreur RLS', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(fromMock).toHaveBeenCalledWith('pro_clients');
  });
});
