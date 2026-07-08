import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistActionState,
  readPersistedActionStates,
  getLeadActionStatus,
  ACTION_STATUS_KEY,
} from './dailyActionStatus';

describe('dailyActionStatus — lien partagé Actions <-> Pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('un statut écrit (côté Actions) est relu (côté Pipeline) par lead id', () => {
    // Côté « Actions » : on termine l'action du jour du lead abc.
    persistActionState('lead:abc', { status: 'completed' });
    // Côté « Pipeline » : la carte du lead abc lit le MÊME statut.
    expect(getLeadActionStatus('abc')).toBe('completed');
    // Un autre lead reste vierge.
    expect(getLeadActionStatus('xyz')).toBeNull();
  });

  it('« en cours » puis « terminé » : le dernier statut gagne', () => {
    persistActionState('lead:abc', { status: 'in-progress' });
    expect(getLeadActionStatus('abc')).toBe('in-progress');
    persistActionState('lead:abc', { status: 'completed' });
    expect(getLeadActionStatus('abc')).toBe('completed');
  });

  it('purge des statuts de plus de 7 jours (les actions du jour tournent)', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      ACTION_STATUS_KEY,
      JSON.stringify({ 'lead:vieux': { status: 'completed', at: old } }),
    );
    expect(readPersistedActionStates()['lead:vieux']).toBeUndefined();
    expect(getLeadActionStatus('vieux')).toBeNull();
  });

  it('stockage corrompu : lecture tolérante (aucune exception)', () => {
    localStorage.setItem(ACTION_STATUS_KEY, '{pas du json');
    expect(readPersistedActionStates()).toEqual({});
    expect(getLeadActionStatus('abc')).toBeNull();
  });
});
