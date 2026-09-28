/**
 * Garde-fou : aucun écran professionnel ne fabrique de données.
 *
 * CE QUI S'EST PASSÉ. Trois fonctions — `getClientOrders`,
 * `getClientNotifications`, `getMaintenanceInterventions` — insérainet, quand
 * l'utilisateur n'avait pas de fiche `pro_clients`, des lignes de
 * DÉMONSTRATION dans les tables de production (`client_orders`,
 * `client_notifications`, `maintenance_interventions` — vérifié : les trois
 * existent bien en production).
 *
 * Deux défauts, pas un :
 *
 *  1. Les lignes portaient `client_id: proProfile?.id || user.id`, écrit à
 *     l'intérieur du bloc `if (!proProfile)`. Dans cette branche `proProfile`
 *     vaut nécessairement `null`, donc `client_id` valait TOUJOURS `user.id`,
 *     l'identifiant du compte — alors que la lecture filtre sur
 *     `proProfile.id`, l'identifiant de la fiche pro. Les lignes insérées
 *     n'étaient donc jamais relues : vues une fois, puis perdues, et une
 *     nouvelle fournée à chaque visite.
 *  2. C'est de la donnée inventée présentée comme réelle, ce que la règle du
 *     projet interdit explicitement.
 *
 * Ces tests échouent si quelqu'un réintroduit une écriture sur ce chemin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const getProClientProfile = vi.fn();
const from = vi.fn();

vi.mock('../supabaseClient', () => ({
  default: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));
vi.mock('./profile', () => ({
  getProClientProfile: (...a: unknown[]) => getProClientProfile(...a),
}));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../supabaseCall', () => ({
  supabaseCall: async (_n: string, f: () => Promise<unknown>) => f(),
}));

import { getClientOrders } from './orders';
import { getClientNotifications } from './notifications';
import { getMaintenanceInterventions } from './maintenance';

/** Constructeur de requête qui hurle si on tente une écriture. */
function requeteQuiRefuseLesEcritures() {
  const interdit = (verbe: string) => () => {
    throw new Error(`ÉCRITURE INTERDITE : ${verbe}() appelé sans profil Pro`);
  };
  const chaine: Record<string, unknown> = {
    insert: interdit('insert'),
    upsert: interdit('upsert'),
    update: interdit('update'),
    delete: interdit('delete'),
  };
  // Les lectures restent possibles, et rendent une liste vide.
  chaine.select = () => chaine;
  chaine.eq = () => chaine;
  chaine.order = () => Promise.resolve({ data: [], error: null });
  return chaine;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } } });
  from.mockImplementation(() => requeteQuiRefuseLesEcritures());
});

const CAS: Array<[string, () => Promise<unknown[]>]> = [
  ['commandes', getClientOrders],
  ['notifications', getClientNotifications],
  ['interventions de maintenance', getMaintenanceInterventions],
];

describe.each(CAS)('%s — utilisateur SANS fiche pro_clients', (nom, appeler) => {
  beforeEach(() => getProClientProfile.mockResolvedValue(null));

  it('rend une liste vide plutôt que des données inventées', async () => {
    await expect(appeler()).resolves.toEqual([]);
  });

  it("n'ouvre aucune table : ni écriture, ni lecture", async () => {
    await appeler();
    // L'assertion juste est celle-ci, et elle est plus forte que « pas
    // d'insert » : sans fiche pro, il n'y a rien à lire ni à écrire, donc
    // `from()` ne doit pas être appelé du tout. Le simulacre lèverait de toute
    // façon sur insert/upsert/update/delete si quelqu'un revenait en arrière.
    expect(from).not.toHaveBeenCalled();
  });

  it("le simulacre refuserait bien une écriture, si elle revenait", async () => {
    // Sans ce test, le précédent passerait aussi avec un simulacre inerte.
    const requete = requeteQuiRefuseLesEcritures() as { insert: () => void };
    expect(() => requete.insert()).toThrow(/ÉCRITURE INTERDITE/);
  });
});

describe.each(CAS)('%s — utilisateur AVEC fiche pro_clients', (nom, appeler) => {
  beforeEach(() => getProClientProfile.mockResolvedValue({ id: 'pro-42' }));

  it('lit la base et rend ce qu’elle contient, sans rien inventer', async () => {
    await expect(appeler()).resolves.toEqual([]);
    expect(from).toHaveBeenCalled();
  });
});
