import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import PaddleCheckoutButton from './PaddleCheckoutButton';

/**
 * MG-H10 — PREUVE DE L'INVARIANT « UN SEUL ABONNEMENT ACTIF ».
 *
 * LE DÉFAUT
 *   Un client déjà abonné qui changeait de formule voyait s'ouvrir un SECOND
 *   abonnement Paddle au lieu de voir le premier modifié : il payait deux fois.
 *
 * POURQUOI CE TEST EST LA BONNE PREUVE CÔTÉ CODE
 *   Une seconde souscription Paddle ne peut naître que d'UN SEUL endroit :
 *   l'ouverture d'un checkout (`openPlanCheckout`). Prouver « aucun checkout
 *   ouvert quand un abonnement existe déjà » revient donc à prouver « pas de
 *   second abonnement ». Tout le reste du parcours (proration, montant) se passe
 *   chez Paddle et se vérifie contre le bac à sable — voir
 *   `.audit/verifier-un-seul-abonnement.mjs`.
 *
 * CE QUE CE TEST NE PROUVE PAS
 *   Que Paddle applique bien la proration, ni le montant facturé. Il prouve que
 *   notre code ne peut pas créer de doublon.
 */

const invoke = vi.fn();
const getUser = vi.fn();
const getMySubscription = vi.fn();
const openPlanCheckout = vi.fn();

vi.mock('../utils/supabaseClient', () => ({
  default: {
    auth: { getUser: () => getUser() },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('../utils/api/subscription', () => ({
  getMySubscription: () => getMySubscription(),
}));

vi.mock('../utils/paddle', () => ({
  isPaddleConfigured: () => true,
  openPlanCheckout: (...a: unknown[]) => openPlanCheckout(...a),
}));

vi.mock('../config/plans', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../config/plans')>();
  return {
    ...reel,
    // Les identifiants de prix viennent de l'environnement : on les fixe pour
    // que le test ne dépende pas du .env de la machine.
    getPaidPlan: (id: unknown) => {
      const plan = reel.getPaidPlan(id);
      return plan ? { ...plan, paddlePriceId: 'pri_test_0001' } : null;
    },
  };
});

const ABONNE = { isActive: true, type: 'enterprise', status: 'active', endsAt: null };
const PAS_ABONNE = { isActive: false, type: null, status: null, endsAt: null };

/** Clique et laisse la chaîne de promesses du gestionnaire se dérouler. */
async function cliquer() {
  fireEvent.click(screen.getByRole('button'));
  // Le gestionnaire enchaîne plusieurs `await` : on rend la main à la boucle
  // d'événements pour qu'ils se résolvent avant les assertions.
  await act(async () => { await Promise.resolve(); });
}

function monter(onError = vi.fn(), onSuccess = vi.fn()) {
  render(
    <PaddleCheckoutButton planId="enterprise" onSuccess={onSuccess} onError={onError} />,
  );
  return { onError, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'test@minegrid.ma' } } });
  openPlanCheckout.mockResolvedValue(undefined);
});

describe('PaddleCheckoutButton — au plus UN abonnement Paddle actif', () => {
  it("changement de formule réussi : AUCUN checkout n'est ouvert", async () => {
    getMySubscription.mockResolvedValue(ABONNE);
    invoke.mockResolvedValue({ data: { ok: true, upgraded: true }, error: null });

    const { onSuccess } = monter();
    await cliquer();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('paddle-upgrade', expect.anything());
    // LE point : le second abonnement ne peut naître que d'ici.
    expect(openPlanCheckout).not.toHaveBeenCalled();
  });

  it("résiliation programmée levée au passage : l'utilisateur en est AVERTI", async () => {
    // Paddle refuse de changer le prix d'un abonnement portant une résiliation
    // programmée ; la fonction la lève d'abord. C'est un changement réel du
    // contrat — il doit être annoncé, jamais silencieux.
    getMySubscription.mockResolvedValue(ABONNE);
    invoke.mockResolvedValue({
      data: { ok: true, upgraded: true, resiliation_annulee: true },
      error: null,
    });

    const { onError, onSuccess } = monter();
    await cliquer();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/résiliation programmée a été annulée/i);
    expect(openPlanCheckout).not.toHaveBeenCalled();
  });

  it("paddle-upgrade renvoie une erreur : on REFUSE plutôt que d'ouvrir un second abonnement", async () => {
    getMySubscription.mockResolvedValue(ABONNE);
    // `functions.invoke` ne lève pas sur un 502 : il le rend dans `error`.
    invoke.mockResolvedValue({ data: null, error: new Error('502 paddle_error') });

    const { onError } = monter();
    await cliquer();

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(openPlanCheckout).not.toHaveBeenCalled();
    expect(String(onError.mock.calls[0][0])).toMatch(/aucun second prélèvement/i);
  });

  it('fonction injoignable (non déployée, réseau coupé) : toujours aucun checkout', async () => {
    getMySubscription.mockResolvedValue(ABONNE);
    invoke.mockRejectedValue(new Error('Failed to fetch'));

    const { onError } = monter();
    await cliquer();

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(openPlanCheckout).not.toHaveBeenCalled();
  });

  it("première souscription : le checkout s'ouvre normalement (rien à dupliquer)", async () => {
    getMySubscription.mockResolvedValue(PAS_ABONNE);

    monter();
    await cliquer();

    await waitFor(() => expect(openPlanCheckout).toHaveBeenCalledTimes(1));
    // Inutile d'appeler la fonction de changement : il n'y a rien à modifier.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("accès actif SANS abonnement Paddle (code promo, accès hérité) : le serveur autorise le checkout", async () => {
    getMySubscription.mockResolvedValue(ABONNE);
    invoke.mockResolvedValue({ data: { ok: true, needs_checkout: true }, error: null });

    monter();
    await cliquer();

    await waitFor(() => expect(openPlanCheckout).toHaveBeenCalledTimes(1));
  });

  it('double-clic : une seule tentative part', async () => {
    getMySubscription.mockResolvedValue(PAS_ABONNE);
    let debloquer: () => void = () => {};
    openPlanCheckout.mockImplementation(
      () => new Promise<void>((r) => { debloquer = r; }),
    );

    monter();
    const bouton = screen.getByRole('button');
    fireEvent.click(bouton);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(bouton);
    await act(async () => { await Promise.resolve(); });
    debloquer();

    await waitFor(() => expect(openPlanCheckout).toHaveBeenCalledTimes(1));
  });
});
