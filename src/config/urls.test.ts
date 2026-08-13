import { describe, it, expect, afterEach, vi } from 'vitest';
import { getResetPasswordUrl } from './urls';

function poserUrl(href: string) {
  const url = new URL(href);
  vi.stubGlobal('window', {
    location: { href: url.href, hostname: url.hostname, origin: url.origin },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("getResetPasswordUrl — URL de retour du lien « mot de passe oublié »", () => {
  it("ne contient AUCUN fragment : le service d'authentification l'effacerait", () => {
    // C'est LE défaut corrigé le 2026-08-12 : `…/#update-password` était remplacé
    // par `…/#access_token=…`, si bien que l'utilisateur atterrissait sur l'accueil.
    poserUrl('https://minegrid-equipement.com/#connexion');
    expect(getResetPasswordUrl()).not.toContain('#');
  });

  it('porte le marqueur de réinitialisation dans la query', () => {
    poserUrl('https://minegrid-equipement.com/');
    expect(getResetPasswordUrl()).toBe('https://minegrid-equipement.com/?type=recovery');
  });

  it('utilise le domaine public quand on développe en local', () => {
    // VITE_PRODUCTION_URL est explicitement posé ici : sinon le test dépendrait
    // du .env.local de la machine, et changerait de résultat d'un poste à l'autre.
    vi.stubEnv('VITE_PRODUCTION_URL', 'https://minegrid-equipement.com');
    poserUrl('http://localhost:5188/#mot-de-passe-oublie');
    expect(getResetPasswordUrl()).toBe('https://minegrid-equipement.com/?type=recovery');
    vi.unstubAllEnvs();
  });
});
