import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useShellState } from './useShellState';
import type { ShellWidgetsSource } from './shellTypes';

const fakeSource: ShellWidgetsSource = {
  widgets: [
    { id: 'w1', title: 'Widget 1' },
    { id: 'w2', title: 'Widget 2' },
    { id: 'w3', title: 'Widget 3' },
  ],
};

const validIds = ['w1', 'w2', 'w3'];
const KEY = 'enterpriseDashboardConfig_test-role';
const BACKUP_KEY = 'enterpriseDashboardConfig_test-role_backup';

describe('useShellState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('amorce tous les widgets valides quand aucune config ni defaultActiveIds', async () => {
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );
    await waitFor(() => {
      expect(result.current.config).not.toBeNull();
    });
    // Sans defaultActiveIds, on amorce TOUT le catalogue valide (évite l'écran vide).
    expect(result.current.config?.widgets.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
    expect(result.current.layout.lg.map((l) => l.i)).toEqual(['w1', 'w2', 'w3']);
  });

  it('addWidget ne duplique pas un widget déjà actif', async () => {
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds, defaultActiveIds: ['w1'] }),
    );
    await waitFor(() => expect(result.current.config).not.toBeNull());

    act(() => result.current.addWidget('w1'));

    expect(result.current.config?.widgets.map((w) => w.id)).toEqual(['w1']);
    expect(result.current.layout.lg.map((l) => l.i)).toEqual(['w1']);
  });

  it('purge les widgets qui ne sont plus dans validIds', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        widgets: [{ id: 'w1' }, { id: 'obsolete' }],
        layout: {
          lg: [
            { i: 'w1', x: 0, y: 0, w: 4, h: 2 },
            { i: 'obsolete', x: 0, y: 0, w: 4, h: 2 },
          ],
        },
        widgetSizes: {},
      }),
    );

    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => {
      expect(result.current.config?.widgets.map((w) => w.id)).toEqual(['w1']);
    });
    expect(result.current.layout.lg.map((l) => l.i)).toEqual(['w1']);
  });

  it('addWidget ajoute le widget et persiste', async () => {
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => expect(result.current.config).not.toBeNull());

    act(() => result.current.addWidget('w1'));

    expect(result.current.config?.widgets.map((w) => w.id)).toContain('w1');
    const persisted = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(persisted.widgets.map((w: { id: string }) => w.id)).toContain('w1');
  });

  it('removeWidget retire le widget et sauvegarde sa position en backup', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        widgets: [{ id: 'w1' }],
        layout: { lg: [{ i: 'w1', x: 2, y: 3, w: 6, h: 4 }] },
        widgetSizes: {},
      }),
    );

    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => expect(result.current.config?.widgets?.length).toBe(1));

    act(() => result.current.removeWidget('w1'));

    expect(result.current.config?.widgets).toEqual([]);
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '{}');
    expect(backup.layout.lg[0]).toMatchObject({ i: 'w1', x: 2, y: 3, w: 6, h: 4 });
  });

  it('restoreAllWidgets re-ajoute les widgets manquants', async () => {
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => expect(result.current.config).not.toBeNull());

    act(() => result.current.restoreAllWidgets());

    expect(result.current.config?.widgets.map((w) => w.id).sort()).toEqual(['w1', 'w2', 'w3']);
  });

  it('saveDashboard met le status en saving puis idle', async () => {
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(async () => {
      await result.current.saveDashboard();
    });
    await waitFor(() => expect(['idle', 'saved']).toContain(result.current.saveStatus));
  });

  it('cle localStorage isolee par role (pas de collision entre metiers)', async () => {
    const { result: r1 } = renderHook(() =>
      useShellState({ role: 'mecanicien', widgetsSource: fakeSource, validIds }),
    );
    const { result: r2 } = renderHook(() =>
      useShellState({ role: 'loueur', widgetsSource: fakeSource, validIds }),
    );

    await waitFor(() => expect(r1.current.config?.widgets?.length).toBe(3));
    await waitFor(() => expect(r2.current.config?.widgets?.length).toBe(3));

    // Muter un rôle ne doit PAS affecter l'autre (clés localStorage distinctes par rôle).
    act(() => r1.current.removeWidget('w1'));

    expect(r1.current.config?.widgets.map((w) => w.id)).toEqual(['w2', 'w3']);
    expect(r2.current.config?.widgets.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
  });

  it('amorce le sous-ensemble par défaut (defaultActiveIds, ordonné) quand aucune config', async () => {
    const { result } = renderHook(() =>
      useShellState({
        role: 'test-role',
        widgetsSource: fakeSource,
        validIds,
        defaultActiveIds: ['w3', 'w1'], // ordre = ordre d'affichage ; w2 reste seulement ajoutable
      }),
    );
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.config?.widgets.map((w) => w.id)).toEqual(['w3', 'w1']);
    expect(result.current.layout.lg.map((l) => l.i)).toEqual(['w3', 'w1']);
  });

  it('ne ré-amorce PAS si une config existe déjà (respecte la personnalisation)', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        widgets: [{ id: 'w2' }],
        layout: { lg: [{ i: 'w2', x: 0, y: 0, w: 4, h: 2 }] },
        widgetSizes: {},
      }),
    );
    const { result } = renderHook(() =>
      useShellState({ role: 'test-role', widgetsSource: fakeSource, validIds, defaultActiveIds: ['w1', 'w3'] }),
    );
    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.config?.widgets.map((w) => w.id)).toEqual(['w2']);
  });
});
