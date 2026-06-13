import { describe, it, expect, beforeEach } from 'vitest';
import { isDemoBackend, isPresentationMode, setPresentationMode, DEMO_USER } from './demoMode';

// En test, VITE_SUPABASE_URL = test.supabase.co (.env.test) => backend démo.
describe('mode présentation (démo investisseur honnête)', () => {
  beforeEach(() => localStorage.clear());

  it('le backend de test est détecté comme démo', () => {
    expect(isDemoBackend()).toBe(true);
  });

  it('désactivé par défaut', () => {
    expect(isPresentationMode()).toBe(false);
  });

  it('s\'active et se désactive', () => {
    setPresentationMode(true);
    expect(isPresentationMode()).toBe(true);
    setPresentationMode(false);
    expect(isPresentationMode()).toBe(false);
  });

  it('l\'utilisateur de démo n\'est pas un vrai compte', () => {
    expect(DEMO_USER.email).toContain('demo');
    expect(DEMO_USER.id).toBeTruthy();
  });
});
