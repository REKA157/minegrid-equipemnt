import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Tests d'integration legers des hooks React Query :
 * on mocke les fonctions de l'API (getMessages, getOffers...) et on verifie
 * que les hooks les appellent et exposent bien le resultat.
 */

vi.mock('../../utils/api/messages', () => ({
  getMessages: vi.fn(async () => [{ id: 'm1', subject: 'hi' }]),
  sendMessage: vi.fn(async () => ({ id: 'm2' })),
  markMessageAsRead: vi.fn(async () => undefined),
}));

vi.mock('../../utils/api/offers', () => ({
  getOffers: vi.fn(async () => [{ id: 'o1', amount: 42 }]),
  createOffer: vi.fn(async () => ({ id: 'o2' })),
  updateOfferStatus: vi.fn(async () => undefined),
}));

vi.mock('../../utils/api/profile', () => ({
  getUserProfile: vi.fn(async () => ({ id: 'u1', full_name: 'Jean' })),
  updateUserProfile: vi.fn(async () => undefined),
}));

vi.mock('../../utils/proApi/machines', () => ({
  getUserMachines: vi.fn(async () => [{ id: 'machine-1' }]),
}));

vi.mock('../../utils/proApi/notifications', () => ({
  getClientNotifications: vi.fn(async () => [{ id: 'n1' }]),
  markNotificationAsRead: vi.fn(async () => true),
  deleteClientNotification: vi.fn(async () => true),
  deleteReadNotifications: vi.fn(async () => true),
}));

import { useMessages } from './useMessages';
import { useOffers } from './useOffers';
import { useUserProfile } from './useUserProfile';
import { useUserMachines } from './useUserMachines';
import { useClientNotifications } from './useClientNotifications';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('hooks React Query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useMessages() retourne les donnees', async () => {
    const { result } = renderHook(() => useMessages(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'm1', subject: 'hi' }]);
  });

  it('useOffers() retourne les donnees', async () => {
    const { result } = renderHook(() => useOffers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'o1', amount: 42 }]);
  });

  it('useUserProfile() retourne les donnees', async () => {
    const { result } = renderHook(() => useUserProfile(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'u1', full_name: 'Jean' });
  });

  it('useUserMachines() retourne les donnees', async () => {
    const { result } = renderHook(() => useUserMachines(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'machine-1' }]);
  });

  it('useClientNotifications() retourne les donnees', async () => {
    const { result } = renderHook(() => useClientNotifications(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'n1' }]);
  });

  it('enabled=false empeche le fetch', async () => {
    const { result } = renderHook(() => useMessages({ enabled: false }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
