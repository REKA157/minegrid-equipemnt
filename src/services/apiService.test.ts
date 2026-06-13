import { describe, it, expect, vi, beforeEach } from 'vitest';

// apiService importe le client Supabase au chargement ; on le stube (non utilisé
// par les fonctions testées, qui sont des actions sans backend).
vi.mock('../utils/supabaseClient', () => {
  const stub = {};
  return { default: stub, supabaseClient: stub };
});

import { apiCall, sendMessage, exportData } from './apiService';

describe('apiService — actions honnêtes (plus de faux succès)', () => {
  beforeEach(() => {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:test');
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  it('apiCall renvoie un échec explicite « non disponible » au lieu de simuler un succès', async () => {
    const res = await apiCall('POST', '/api/actions/sync-crm', {});
    expect(res.success).toBe(false);
    expect(res.notImplemented).toBe(true);
    expect(res.message).toMatch(/disponible/i);
  });

  it('sendMessage ne prétend plus avoir envoyé un SMS/email', async () => {
    const res = await sendMessage('SMS', '+212600000000', 'relance');
    expect(res.success).toBe(false);
    expect(res.notImplemented).toBe(true);
  });

  it('exportData excel/pdf est signalé indisponible (plus de JSON renommé en .excel)', async () => {
    const res = await exportData([{ a: 1 }], 'rapport', 'excel');
    expect(res.success).toBe(false);
    expect(res.notImplemented).toBe(true);
  });

  it('exportData csv produit un vrai CSV avec en-têtes', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const res = await exportData(
      [{ nom: 'Pelle', prix: 1000 }, { nom: 'Grue', prix: 5000 }],
      'stock',
      'csv',
    );
    expect(res.success).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
