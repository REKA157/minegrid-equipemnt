/**
 * MG-M04 — Fuite de donnees locales entre deux comptes sur un poste partage.
 *
 * Le scenario teste est celui de l'audit : le compte A travaille, se deconnecte,
 * le compte B se connecte sur le meme navigateur. B ne doit rien voir de A.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setScoped,
  getScoped,
  purgeLocalUserData,
  migrateLegacyKeys,
  LEGACY_KEYS,
} from '../utils/scopedStorage';

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
});

describe('MG-M04 — cloisonnement du stockage local', () => {
  it("le compte B ne lit pas les donnees du compte A", () => {
    setScoped(USER_A, 'savedQuotes', [{ client: 'Client confidentiel A', total: 250000 }]);

    // B lit la meme cle logique : il doit obtenir le fallback, pas les donnees de A.
    const seenByB = getScoped(USER_B, 'savedQuotes', [] as unknown[]);
    expect(seenByB).toEqual([]);
  });

  it('la purge de deconnexion supprime toutes les donnees applicatives', () => {
    setScoped(USER_A, 'dashboardConfig', { widgets: ['x'] });
    setScoped(USER_A, 'savedQuotes', [{ total: 1 }]);
    window.localStorage.setItem('userRole', 'admin');

    purgeLocalUserData();

    expect(getScoped(USER_A, 'dashboardConfig', null)).toBeNull();
    expect(getScoped(USER_A, 'savedQuotes', null)).toBeNull();
    expect(window.localStorage.getItem('userRole')).toBeNull();
  });

  it("la purge n'efface pas la session du SDK Supabase", () => {
    // Le SDK gere ses propres cles : les supprimer le desynchroniserait.
    window.localStorage.setItem('sb-projet-auth-token', 'jeton-sdk');
    setScoped(USER_A, 'dashboardConfig', { widgets: [] });

    purgeLocalUserData();

    expect(window.localStorage.getItem('sb-projet-auth-token')).toBe('jeton-sdk');
  });

  it('la migration rapatrie les preferences mais supprime les donnees sensibles', () => {
    window.localStorage.setItem('dashboardConfig', JSON.stringify({ widgets: ['a'] }));
    window.localStorage.setItem('savedQuotes', JSON.stringify([{ client: 'A' }]));
    window.localStorage.setItem('userRole', 'admin');

    migrateLegacyKeys(USER_A);

    // Preference rapatriee sous l'espace de A.
    expect(getScoped(USER_A, 'dashboardConfig', null)).toEqual({ widgets: ['a'] });
    // Donnees de provenance incertaine : supprimees, jamais attribuees a A.
    expect(getScoped(USER_A, 'savedQuotes', null)).toBeNull();
    expect(window.localStorage.getItem('savedQuotes')).toBeNull();
    expect(window.localStorage.getItem('userRole')).toBeNull();
  });

  it('aucune cle historique globale ne subsiste apres purge', () => {
    for (const k of LEGACY_KEYS) window.localStorage.setItem(k, 'valeur');
    purgeLocalUserData();
    for (const k of LEGACY_KEYS) {
      expect(window.localStorage.getItem(k)).toBeNull();
    }
  });

  it('le stockage indisponible ne fait pas planter le produit', () => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('stockage bloque (mode prive)'); },
      configurable: true,
    });
    try {
      expect(() => setScoped(USER_A, 'dashboardConfig', { a: 1 })).not.toThrow();
      expect(getScoped(USER_A, 'dashboardConfig', 'fallback')).toBe('fallback');
      expect(() => purgeLocalUserData()).not.toThrow();
    } finally {
      // Restauration obligatoire : le teardown de jsdom lit localStorage apres
      // le test. Sans ce finally, le test echoue sur l'environnement et non sur
      // le code — un faux negatif qui masquerait un vrai defaut.
      Object.defineProperty(window, 'localStorage', {
        value: new MemoryStorage(), writable: true, configurable: true,
      });
    }
  });
});
