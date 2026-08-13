import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Le module `authLink` prend un instantané de l'URL À SON ÉVALUATION.
 * Chaque cas doit donc poser l'URL PUIS importer le module à neuf.
 */
async function chargerAvecUrl(href: string) {
  const url = new URL(href);
  vi.stubGlobal('window', {
    location: {
      href: url.href,
      search: url.search,
      hash: url.hash,
      hostname: url.hostname,
      origin: url.origin,
    },
    history: { replaceState: vi.fn() },
  });
  vi.resetModules();
  return import('./authLink');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('authLink — détection du retour de lien e-mail', () => {
  it('reconnaît le marqueur de réinitialisation porté par la QUERY', async () => {
    const m = await chargerAvecUrl('https://minegrid-equipement.com/?type=recovery');
    expect(m.isPasswordRecoveryLink()).toBe(true);
  });

  it("reconnaît le marqueur même quand le service a écrasé le fragment par ses jetons", async () => {
    // Cas réel : GoTrue remplace le fragment, la query survit.
    const m = await chargerAvecUrl(
      'https://minegrid-equipement.com/?type=recovery#access_token=abc&refresh_token=def&type=recovery',
    );
    expect(m.isPasswordRecoveryLink()).toBe(true);
    expect(m.getAuthLinkError()).toBeNull();
  });

  it("ne se déclenche pas sur une visite ordinaire", async () => {
    const m = await chargerAvecUrl('https://minegrid-equipement.com/#machines');
    expect(m.isPasswordRecoveryLink()).toBe(false);
    expect(m.getAuthLinkError()).toBeNull();
  });

  it('capte un lien périmé et le traduit en français', async () => {
    const m = await chargerAvecUrl(
      'https://minegrid-equipement.com/?type=recovery#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    const erreur = m.getAuthLinkError();
    expect(erreur).not.toBeNull();
    expect(erreur!.code).toBe('otp_expired');
    // Le « + » de l'URL doit être décodé en espace, pas affiché tel quel.
    expect(erreur!.description).toBe('Email link is invalid or has expired');
    expect(m.describeAuthLinkError(erreur!)).toMatch(/expiré|nouveau/i);
  });

  it('nettoie la barre d’adresse une fois le lien consommé', async () => {
    const m = await chargerAvecUrl(
      'https://minegrid-equipement.com/?type=recovery#access_token=abc',
    );
    m.clearAuthLinkTraces();
    const replaceState = (window as unknown as { history: { replaceState: ReturnType<typeof vi.fn> } })
      .history.replaceState;
    expect(replaceState).toHaveBeenCalledTimes(1);
    const nouvelleUrl = String(replaceState.mock.calls[0][2]);
    expect(nouvelleUrl).not.toContain('type=recovery');
    expect(nouvelleUrl).not.toContain('access_token');
  });
});
