import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSubscriptionMock } = vi.hoisted(() => ({ useSubscriptionMock: vi.fn() }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: useSubscriptionMock }));

import RequireSubscription from './RequireSubscription';
import { INACTIVE_SUBSCRIPTION } from '../utils/api/subscription';

describe('RequireSubscription — gating dérivé du serveur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('affiche le contenu si l\'abonnement actif satisfait le niveau requis', () => {
    useSubscriptionMock.mockReturnValue({
      subscription: { isActive: true, type: 'enterprise', status: 'active', endsAt: null },
      isLoading: false,
    });
    render(
      <RequireSubscription level="pro">
        <div>contenu-pro</div>
      </RequireSubscription>,
    );
    expect(screen.getByText('contenu-pro')).toBeInTheDocument();
  });

  it('bloque si abonnement insuffisant (pro < enterprise requis)', () => {
    useSubscriptionMock.mockReturnValue({
      subscription: { isActive: true, type: 'pro', status: 'active', endsAt: null },
      isLoading: false,
    });
    render(
      <RequireSubscription level="enterprise">
        <div>contenu-entreprise</div>
      </RequireSubscription>,
    );
    expect(screen.queryByText('contenu-entreprise')).not.toBeInTheDocument();
    expect(screen.getByText(/réservé aux abonnés/i)).toBeInTheDocument();
  });

  it('bloque si aucun abonnement actif (état serveur inactif)', () => {
    useSubscriptionMock.mockReturnValue({ subscription: INACTIVE_SUBSCRIPTION, isLoading: false });
    render(
      <RequireSubscription>
        <div>contenu-protege</div>
      </RequireSubscription>,
    );
    expect(screen.queryByText('contenu-protege')).not.toBeInTheDocument();
  });

  it('affiche un loader pendant la vérification serveur', () => {
    useSubscriptionMock.mockReturnValue({ subscription: INACTIVE_SUBSCRIPTION, isLoading: true });
    const { container } = render(
      <RequireSubscription>
        <div>contenu</div>
      </RequireSubscription>,
    );
    expect(screen.queryByText('contenu')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
