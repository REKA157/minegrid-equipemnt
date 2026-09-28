import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import PaddleCheckoutButton from './PaddleCheckoutButton';

/**
 * A28-002 — AUCUN FAUX BOUTON DE PAIEMENT.
 *
 * LE DEFAUT
 *   Les identifiants de prix Paddle sont injectes au BUILD (VITE_PADDLE_PRICE_*).
 *   Absents de .env et .env.production, ils valent '' dans le paquet livre : les
 *   trois plans payants affichaient « S'abonner — 20 USD/mois », cadenas compris,
 *   alors qu'aucun ne pouvait aboutir.
 *
 * CE QUE CES TESTS VERROUILLENT
 *   1. sans identifiant exploitable, le bouton l'annonce AVANT le clic et ne
 *      peut pas ouvrir de checkout ;
 *   2. un gabarit non vide (`pri_xxx…`, .env.example recopie) est traite comme
 *      une absence, pas comme une configuration valide ;
 *   3. le jeton client absent reste refuse au clic, meme avec un prix valide.
 *
 * CE QUE CES TESTS NE PROUVENT PAS
 *   Que Paddle accepte un identifiant donne : cela se verifie contre le bac a
 *   sable, pas ici. Ils prouvent que notre code ne promet pas un paiement qu'il
 *   ne peut pas tenir.
 */

const getUser = vi.fn();
const getMySubscription = vi.fn();
const openPlanCheckout = vi.fn();
const isPaddleConfigure = vi.fn();

/** Identifiant de prix injecte plan par plan, comme le ferait l'environnement de build. */
let prixParPlan: Record<string, string> = {};

vi.mock('../utils/supabaseClient', () => ({
  default: {
    auth: { getUser: () => getUser() },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('../utils/api/subscription', () => ({
  getMySubscription: () => getMySubscription(),
}));

vi.mock('../utils/paddle', () => ({
  isPaddleConfigured: () => isPaddleConfigure(),
  openPlanCheckout: (...a: unknown[]) => openPlanCheckout(...a),
}));

vi.mock('../config/plans', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../config/plans')>();
  return {
    ...reel,
    getPaidPlan: (id: unknown) => {
      const plan = reel.getPaidPlan(id);
      return plan ? { ...plan, paddlePriceId: prixParPlan[plan.internalId] ?? '' } : null;
    },
  };
});

const PAS_ABONNE = { isActive: false, type: null, status: null, endsAt: null };

/** Clique et laisse la chaine de promesses du gestionnaire se derouler. */
async function cliquer() {
  fireEvent.click(screen.getByRole('button'));
  await act(async () => { await Promise.resolve(); });
}

function monter(planId: string, onError = vi.fn(), onSuccess = vi.fn()) {
  render(
    <PaddleCheckoutButton planId={planId} onSuccess={onSuccess} onError={onError} />,
  );
  return { onError, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  prixParPlan = {};
  getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'test@minegrid.ma' } } });
  getMySubscription.mockResolvedValue(PAS_ABONNE);
  openPlanCheckout.mockResolvedValue(undefined);
  isPaddleConfigure.mockReturnValue(true);
});

describe('PaddleCheckoutButton — paiement non configure (A28-002)', () => {
  it.each([
    ['pro', 'Premium', 20],
    ['premium', 'Pro', 50],
    ['enterprise', 'Enterprise', 200],
  ])(
    "plan %s (« %s », %i USD) : identifiant de prix vide -> le bouton l'annonce AVANT le clic",
    async (planId, _libelle, prix) => {
      // Etat exact du paquet livre : VITE_PADDLE_PRICE_* absentes -> ''.
      prixParPlan = {};

      monter(planId);

      const bouton = screen.getByRole('button');
      // Le bouton ne promet plus un paiement qu'il ne peut pas tenir.
      expect(bouton).toBeDisabled();
      expect(bouton.textContent).not.toMatch(new RegExp(`${prix}\\s*USD`));
      expect(bouton.textContent).toMatch(/indisponible/i);
      // Et il dit quoi faire a la place.
      expect(document.body.textContent).toMatch(/code promo/i);
      expect(document.body.textContent).toMatch(/support/i);
    },
  );

  it("identifiant de prix vide : aucun checkout ne peut s'ouvrir, meme en forcant le clic", async () => {
    prixParPlan = {};

    for (const planId of ['pro', 'premium', 'enterprise']) {
      const { onSuccess } = monter(planId);
      await cliquer();
      expect(openPlanCheckout).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("gabarit de .env.example (pri_xxx…) : traite comme une absence, aucun checkout", async () => {
    // Non vide : une simple verite de chaine l'accepterait, et Paddle rendrait
    // un overlay vide au client.
    prixParPlan = { enterprise: 'pri_xxxxxxxxxxxxxxxxxxxxxxxxxx' };

    monter('enterprise');

    expect(screen.getByRole('button')).toBeDisabled();
    await cliquer();
    expect(openPlanCheckout).not.toHaveBeenCalled();
  });

  it("jeton client absent mais prix valide : refus explicite au clic, aucun checkout", async () => {
    prixParPlan = { enterprise: 'pri_test_0001' };
    isPaddleConfigure.mockReturnValue(false);

    const { onError } = monter('enterprise');
    // Le prix etant exploitable, le bouton reste actif : seul le clic peut
    // constater l'absence de jeton (elle vit dans utils/paddle, charge a la demande).
    expect(screen.getByRole('button')).not.toBeDisabled();
    await cliquer();

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(String(onError.mock.calls[0][0])).toMatch(/pas encore configur/i);
    expect(String(onError.mock.calls[0][0])).toMatch(/code promo/i);
    expect(openPlanCheckout).not.toHaveBeenCalled();
  });

  it('configuration complete : le checkout part avec le bon identifiant de prix', async () => {
    prixParPlan = { premium: 'pri_test_0050' };

    monter('premium');

    expect(screen.getByRole('button')).not.toBeDisabled();
    await cliquer();

    await waitFor(() => expect(openPlanCheckout).toHaveBeenCalledTimes(1));
    expect(openPlanCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ paddlePriceId: 'pri_test_0050', internalPlanId: 'premium' }),
    );
  });
});
