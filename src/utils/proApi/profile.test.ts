import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du client Supabase (chaîne from().select().eq().single()).
// NB : le mock ne fournit volontairement PAS .insert — si le code tentait de
// créer un abonnement côté client (l'ancien comportement = contournement de
// paiement), l'appel lèverait et le test échouerait.
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

import { getProClientProfile } from './profile';

describe('getProClientProfile — lecture seule, jamais d\'auto-activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('retourne null si aucun abonnement (PGRST116) sans tenter d\'insertion', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const res = await getProClientProfile();
    expect(res).toBeNull();
    expect(fromMock).toHaveBeenCalledWith('pro_clients');
    expect(selectMock).toHaveBeenCalled();
  });

  it('retourne le profil existant tel quel', async () => {
    single.mockResolvedValue({
      data: { user_id: 'u1', subscription_status: 'active' },
      error: null,
    });
    const res = await getProClientProfile();
    expect(res).toEqual({ user_id: 'u1', subscription_status: 'active' });
  });

  it('retourne null sur erreur non-PGRST116 (pas d\'abonnement de secours créé)', async () => {
    single.mockResolvedValue({ data: null, error: { code: '42501', message: 'rls' } });
    const res = await getProClientProfile();
    expect(res).toBeNull();
  });

  it('retourne null si l\'utilisateur n\'est pas connecté', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await getProClientProfile();
    expect(res).toBeNull();
  });
});
