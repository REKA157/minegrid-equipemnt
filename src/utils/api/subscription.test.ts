import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  default: { auth: { getUser }, rpc },
}));

import { getMySubscription, hasEnterprise } from './subscription';

const inFuture = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

// getMySubscription passe désormais par la RPC get_effective_subscription
// (SECURITY DEFINER) : le serveur calcule is_active (statut + expiration) ET
// applique l'héritage « le propriétaire paie, l'équipe hérite ». Le frontend se
// contente de mapper la réponse (jamais de logique payante côté client).
describe('getMySubscription — état dérivé du serveur (RPC), jamais de localStorage', () => {
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

  it('actif si la RPC renvoie is_active (ex. enterprise hérité du propriétaire)', async () => {
    rpc.mockResolvedValue({
      data: [{ is_active: true, type: 'enterprise', status: 'active', ends_at: inFuture(), source: 'org' }],
      error: null,
    });
    const s = await getMySubscription();
    expect(rpc).toHaveBeenCalledWith('get_effective_subscription');
    expect(s.isActive).toBe(true);
    expect(s.type).toBe('enterprise');
    expect(hasEnterprise(s)).toBe(true);
  });

  it('inactif si la RPC renvoie is_active=false (ex. propriétaire expiré/annulé)', async () => {
    rpc.mockResolvedValue({
      data: [{ is_active: false, type: null, status: 'active', ends_at: null, source: 'org' }],
      error: null,
    });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(s.type).toBeNull();
  });

  it('le type reste null tant que ce n est pas actif (garde côté client)', async () => {
    rpc.mockResolvedValue({
      data: [{ is_active: false, type: 'enterprise', status: 'cancelled', ends_at: inFuture(), source: 'org' }],
      error: null,
    });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(s.type).toBeNull();
  });

  it('inactif si erreur RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(rpc).toHaveBeenCalledWith('get_effective_subscription');
  });

  it('inactif si la RPC ne renvoie aucune ligne', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const s = await getMySubscription();
    expect(s.isActive).toBe(false);
    expect(s.type).toBeNull();
  });
});
