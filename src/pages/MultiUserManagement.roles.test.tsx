/**
 * Ce fichier couvre un DÉFAUT DE DROITS trouvé le 2026-09-28, pas un détail
 * d'affichage.
 *
 * Avant correction, `handleUpdateMember` ne faisait qu'un `setTeamMembers` en
 * mémoire. La fonction serveur `setOrgMemberRole` (RPC `set_org_member_role`,
 * présente dans les deux bases) existait et n'était appelée NULLE PART dans
 * `src/`. Conséquence : un administrateur qui rétrogradait un « Administrateur »
 * en « Lecteur » voyait l'écran changer, partait rassuré — et la base gardait
 * `admin`. Au rechargement l'ancien rôle revenait, et la personne conservait
 * tous ses droits côté RLS.
 *
 * Un droit retiré à l'écran mais conservé en base est pire que pas de bouton du
 * tout : il fait croire que l'accès est coupé.
 *
 * Deuxième défaut couvert ici : en cas d'échec serveur, l'écran ne doit pas
 * afficher le nouveau rôle. Mieux vaut un échec visible qu'un succès imaginaire.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setOrgMemberRole = vi.fn();
const getOrgMembers = vi.fn();
const setMemberScope = vi.fn();
const toast = vi.fn();

vi.mock('../utils/api/organization', () => ({
  getOrgMembers: (...a: unknown[]) => getOrgMembers(...a),
  removeOrgMember: vi.fn().mockResolvedValue({ ok: true }),
  setOrgMemberRole: (...a: unknown[]) => setOrgMemberRole(...a),
}));
vi.mock('../utils/api/memberScope', () => ({
  setMemberScope: (...a: unknown[]) => setMemberScope(...a),
}));
vi.mock('../utils/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.mock('../hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: { type: 'enterprise', isActive: true }, isLoading: false }),
}));
vi.mock('../utils/api/subscription', () => ({ hasEnterprise: () => true }));
vi.mock('../utils/userManagement', () => ({
  inviteUser: vi.fn(),
  getUserInvitations: vi.fn().mockResolvedValue([]),
  cancelInvitation: vi.fn(),
}));
vi.mock('../utils/setupUserInvitations', () => ({ setupUserInvitationsTable: vi.fn() }));
vi.mock('../utils/api/sessions', () => ({
  getMemberSessions: vi.fn().mockResolvedValue([]),
  getOrgSessionStats: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/pendingTenderRoles', () => ({
  addPendingTenderRole: vi.fn(), getPendingTenderRole: vi.fn(), removePendingTenderRole: vi.fn(),
  addPendingMemberScope: vi.fn(), getPendingMemberScope: vi.fn(), removePendingMemberScope: vi.fn(),
}));
// Le magasin est consomme par SELECTEUR — useTendersStore((s) => s.xxx) — et
// aussi en statique via .getState(). Un simulacre qui rend un objet fixe casse
// donc les deux usages : il faut appliquer le selecteur.
vi.mock('../tenders/store/tendersStore', () => {
  const etat = { roleAssignments: [], upsertRoleAssignment: vi.fn() };
  const hook = (selecteur) => (selecteur ? selecteur(etat) : etat);
  hook.getState = () => etat;
  return { useTendersStore: hook };
});
vi.mock('../utils/supabaseClient', () => ({
  default: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'moi' } } }) },
  },
}));

import MultiUserManagement from './MultiUserManagement';

const MEMBRE = {
  user_id: 'u-karim',
  email: 'karim@exemple.ma',
  first_name: 'Karim',
  last_name: 'Bennani',
  role: 'admin',
  last_sign_in_at: null,
};

/** Ouvre la fiche d'édition du membre listé. */
async function ouvrirEdition() {
  render(<MultiUserManagement />);
  await screen.findByText('Karim Bennani');
  // On cible par le libellé accessible, pas par la classe de l'icône : c'est
  // ce qu'un utilisateur au lecteur d'écran entend, donc le bon point d'ancrage.
  fireEvent.click(screen.getByRole('button', { name: /Modifier Karim Bennani/i }));
  return await screen.findByText('Modifier le membre');
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrgMembers.mockResolvedValue([MEMBRE]);
  setOrgMemberRole.mockResolvedValue({ ok: true });
  setMemberScope.mockResolvedValue({ success: true });
});

describe('rétrogradation d’un membre — persistance côté serveur', () => {
  it('envoie le nouveau rôle au serveur, et pas seulement à l’écran', async () => {
    await ouvrirEdition();

    const select = document.querySelector('select[name="role"]') as HTMLSelectElement;
    expect(select, 'sélecteur de rôle introuvable').toBeTruthy();
    fireEvent.change(select, { target: { value: 'viewer' } });
    fireEvent.submit(select.closest('form') as HTMLFormElement);

    // LE point du test : sans cet appel, la base garde 'admin'.
    await waitFor(() => {
      expect(setOrgMemberRole).toHaveBeenCalledWith('u-karim', 'viewer');
    });
  });

  it('n’appelle pas le serveur quand le rôle n’a pas changé', async () => {
    await ouvrirEdition();
    const select = document.querySelector('select[name="role"]') as HTMLSelectElement;
    fireEvent.submit(select.closest('form') as HTMLFormElement);
    await waitFor(() => expect(setMemberScope).toHaveBeenCalled());
    expect(setOrgMemberRole).not.toHaveBeenCalled();
  });

  it('garde l’ancien rôle à l’écran si le serveur refuse', async () => {
    // Un succès affiché sur un échec serveur est le pire des deux mondes :
    // l'administrateur croit l'accès coupé alors qu'il ne l'est pas.
    setOrgMemberRole.mockResolvedValue({ ok: false, error: 'RLS: interdit' });
    await ouvrirEdition();

    const select = document.querySelector('select[name="role"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'viewer' } });
    fireEvent.submit(select.closest('form') as HTMLFormElement);

    await waitFor(() => expect(setOrgMemberRole).toHaveBeenCalled());
    // La fenêtre reste ouverte : le changement n'a pas eu lieu.
    expect(screen.queryByText('Modifier le membre')).not.toBeNull();
    const messages = toast.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(messages).toMatch(/interdit|enregistr/i);
  });
});
