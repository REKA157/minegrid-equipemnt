import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Ce harnais existe à cause d'un défaut RÉEL, introduit puis corrigé le
 * 2026-08-12 : l'écran « mot de passe » était piloté par un instantané figé,
 * si bien qu'une fois affiché, plus AUCUN lien du site ne fonctionnait — ni le
 * menu, ni le bouton « Aller à la connexion ». Seule la touche F5 en sortait.
 * Les tests unitaires des modules isolés passaient tous au vert : c'est
 * l'enchaînement qui était cassé, pas les pièces.
 */
async function chargerHook(href: string) {
  vi.resetModules();
  const url = new URL(href);
  // On pose l'URL AVANT l'import : `authLink` fige son instantané à l'évaluation.
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  const { useAuthLinkReturn } = await import('./useAuthLinkReturn');
  return renderHook(() => useAuthLinkReturn());
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.resetModules();
});

describe("useAuthLinkReturn — l'écran de lien e-mail doit rester quittable", () => {
  it('signale le retour de lien à la première ouverture', async () => {
    const { result } = await chargerHook('http://localhost/?type=recovery#access_token=abc');
    expect(result.current).toBe(true);
  });

  it('REND LA MAIN dès la première navigation — sinon l’utilisateur est piégé', async () => {
    const { result } = await chargerHook('http://localhost/?type=recovery#access_token=abc');
    expect(result.current).toBe(true);

    act(() => {
      window.location.hash = '#connexion';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current).toBe(false);
  });

  it("signale aussi un lien périmé (sinon : retour muet à l'accueil)", async () => {
    const { result } = await chargerHook(
      'http://localhost/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(result.current).toBe(true);
  });

  it('ne se déclenche pas sur une visite ordinaire', async () => {
    const { result } = await chargerHook('http://localhost/#machines');
    expect(result.current).toBe(false);
  });
});
