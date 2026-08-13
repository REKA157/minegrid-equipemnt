import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RequirePlatformAdmin from './RequirePlatformAdmin';

/**
 * La garde de la console d'administration doit REFUSER PAR DÉFAUT.
 *
 * Ces cas ne sont pas théoriques : les deux gardes déjà présentes dans le
 * projet laissent passer dans au moins une de ces situations (code d'accès sans
 * compte pour l'une, tolérance à l'erreur pour l'autre). Devant la liste de
 * tous les abonnés, il fallait un composant qui ne pardonne rien.
 */

const isPlatformAdmin = vi.fn();

vi.mock('../utils/api/platformAdmin', () => ({
  isPlatformAdmin: () => isPlatformAdmin(),
}));

const SECRET = 'Liste des abonnes';

function monter() {
  render(
    <RequirePlatformAdmin>
      <p>{SECRET}</p>
    </RequirePlatformAdmin>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('RequirePlatformAdmin — refus par défaut', () => {
  it('administrateur reconnu : le contenu s’affiche', async () => {
    isPlatformAdmin.mockResolvedValue(true);
    monter();
    await waitFor(() => expect(screen.getByText(SECRET)).toBeTruthy());
  });

  it('non-administrateur : « page introuvable », et surtout PAS « accès refusé »', async () => {
    isPlatformAdmin.mockResolvedValue(false);
    monter();
    await waitFor(() => expect(screen.getByText(/Page introuvable/i)).toBeTruthy());
    expect(screen.queryByText(SECRET)).toBeNull();
    // Un visiteur n'a pas à apprendre que la console existe.
    expect(document.body.textContent).not.toMatch(/refus|interdit|administrateur/i);
  });

  it('erreur réseau : on refuse (jamais de tolérance ici)', async () => {
    isPlatformAdmin.mockRejectedValue(new Error('Failed to fetch'));
    monter();
    await waitFor(() => expect(screen.getByText(/Page introuvable/i)).toBeTruthy());
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('pendant la vérification : rien du contenu protégé n’est rendu', async () => {
    // Promesse volontairement non résolue : on reste dans l'état de chargement.
    isPlatformAdmin.mockReturnValue(new Promise(() => {}));
    monter();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('réponse inattendue (ni vrai ni faux) : on refuse', async () => {
    isPlatformAdmin.mockResolvedValue(undefined as unknown as boolean);
    monter();
    await waitFor(() => expect(screen.getByText(/Page introuvable/i)).toBeTruthy());
    expect(screen.queryByText(SECRET)).toBeNull();
  });
});
