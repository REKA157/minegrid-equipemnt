/**
 * Ces tests protègent la correction du défaut le plus coûteux du site :
 * le filtrage se faisait DANS LE NAVIGATEUR, sur 400 annonces téléchargées
 * (3 000 au maximum) alors que la base en contient 16 397. Résultat mesuré le
 * 2026-09-29 : 82 % du catalogue introuvable, et « Hitachi » ne renvoyait rien
 * malgré 113 Hitachi en vente.
 *
 * Ce qu'ils vérifient n'est donc pas cosmétique : que chaque critère saisi
 * part BIEN dans la requête envoyée à la base. Si quelqu'un réintroduit un
 * filtre en mémoire, ces tests le voient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Enregistre tout ce qui est demandé à la base, sans rien appeler. */
function faussaireRequete(reponse: { data?: unknown[]; error?: unknown; count?: number } = {}) {
  const appels: Array<{ methode: string; args: unknown[] }> = [];
  const chaine: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'ilike', 'in', 'eq', 'gte', 'lte', 'order', 'limit']) {
    chaine[m] = (...args: unknown[]) => {
      appels.push({ methode: m, args });
      return chaine;
    };
  }
  chaine.range = (...args: unknown[]) => {
    appels.push({ methode: 'range', args });
    return Promise.resolve({
      data: reponse.data ?? [],
      error: reponse.error ?? null,
      count: reponse.count ?? 0,
    });
  };
  return { chaine, appels };
}

const etat: {
  tables: string[];
  courant: ReturnType<typeof faussaireRequete>;
  rpc: { data: unknown; error: unknown };
  tableInconnue: string | null;
} = {
  tables: [],
  courant: faussaireRequete(),
  rpc: { data: null, error: null },
  tableInconnue: null,
};

vi.mock('../supabaseClient', () => ({
  default: {
    from: (t: string) => {
      etat.tables.push(t);
      if (etat.tableInconnue && t === etat.tableInconnue) {
        // Reproduit la réponse réelle de PostgREST quand la vue n'existe pas.
        const f = faussaireRequete({ error: { code: 'PGRST205', message: 'relation does not exist' } });
        // `limit` doit être « attendable » pour la sonde de détection.
        f.chaine.limit = () =>
          Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'relation does not exist' } });
        etat.courant = f;
        return f.chaine;
      }
      const f = faussaireRequete({ count: 42 });
      f.chaine.limit = () => Promise.resolve({ data: [], error: null });
      etat.courant = f;
      return f.chaine;
    },
    rpc: () => Promise.resolve(etat.rpc),
  },
}));

import {
  chercherMachines,
  chargerFacettes,
  assainirRecherche,
  reinitialiserDetection,
} from './catalogueRecherche';

beforeEach(() => {
  etat.tables = [];
  etat.tableInconnue = null;
  etat.rpc = { data: null, error: null };
  reinitialiserDetection();
});

/** Les appels enregistrés pour la dernière requête construite. */
const appels = () => etat.courant.appels;
const aAppele = (methode: string, ...args: unknown[]) =>
  appels().some(
    (a) => a.methode === methode && args.every((v, i) => JSON.stringify(a.args[i]) === JSON.stringify(v)),
  );

describe('assainirRecherche', () => {
  it('retire ce qui casserait la requête envoyée à la base', () => {
    // Une virgule ou une parenthèse dans un `or(...)` de PostgREST casse la
    // requête : la page deviendrait vide sur une saisie banale.
    expect(assainirRecherche('pelle, komatsu (2018)')).toBe('pelle komatsu 2018');
  });

  it('retire les jokers, qui élargiraient la recherche à l’insu de l’utilisateur', () => {
    expect(assainirRecherche('cat*')).toBe('cat');
  });

  it('réduit les espaces multiples et coupe les saisies démesurées', () => {
    expect(assainirRecherche('  pelle    hydraulique  ')).toBe('pelle hydraulique');
    expect(assainirRecherche('a'.repeat(200))).toHaveLength(80);
  });
});

describe('chercherMachines — chaque critère part bien à la base', () => {
  it('cherche le texte dans le nom, la marque, le modèle ET la description', async () => {
    await chercherMachines({ recherche: 'hitachi' }, 0, 20);
    const ou = appels().find((a) => a.methode === 'or');
    expect(ou, 'aucun filtre de recherche envoyé à la base').toBeTruthy();
    const motif = String(ou!.args[0]);
    for (const colonne of ['name', 'brand', 'model', 'description']) {
      expect(motif).toContain(`${colonne}.ilike.%hitachi%`);
    }
  });

  it('filtre la marque côté base, insensible à la casse', async () => {
    await chercherMachines({ marque: 'volvo' }, 0, 20);
    expect(aAppele('ilike', 'brand', 'volvo')).toBe(true);
  });

  it('filtre les catégories côté base', async () => {
    await chercherMachines({ categories: ['pelle-chenilles', 'pelle-pneus'] }, 0, 20);
    expect(aAppele('in', 'category', ['pelle-chenilles', 'pelle-pneus'])).toBe(true);
  });

  it('filtre les années côté base', async () => {
    await chercherMachines({ anneeMin: '2018', anneeMax: '2022' }, 0, 20);
    expect(aAppele('gte', 'year', 2018)).toBe(true);
    expect(aAppele('lte', 'year', 2022)).toBe(true);
  });

  it('ignore une année illisible plutôt que d’envoyer NaN', async () => {
    // `gte('year', NaN)` produirait une requête invalide et une page vide.
    await chercherMachines({ anneeMin: 'abc', anneeMax: '' }, 0, 20);
    expect(appels().some((a) => a.methode === 'gte')).toBe(false);
    expect(appels().some((a) => a.methode === 'lte')).toBe(false);
  });

  it('n’envoie aucun filtre quand rien n’est saisi', async () => {
    await chercherMachines({}, 0, 20);
    for (const m of ['or', 'ilike', 'in', 'eq', 'gte', 'lte']) {
      expect(appels().some((a) => a.methode === m), `${m} ne devrait pas être appelé`).toBe(false);
    }
  });

  it('demande le COMPTE EXACT : c’est lui qui permet d’annoncer « 113 trouvées »', async () => {
    const r = await chercherMachines({ recherche: 'x' }, 0, 20);
    const sel = appels().find((a) => a.methode === 'select');
    expect(JSON.stringify(sel!.args[1])).toContain('exact');
    expect(r.total).toBe(42);
  });

  it('pagine par la base, pas en mémoire', async () => {
    await chercherMachines({}, 40, 20);
    expect(aAppele('range', 40, 59)).toBe(true);
  });
});

describe('quand la migration p33 n’est PAS appliquée', () => {
  beforeEach(() => {
    etat.tableInconnue = 'machines_catalogue';
  });

  it('retombe sur la table machines au lieu de casser', async () => {
    await chercherMachines({ recherche: 'x' }, 0, 20);
    expect(etat.tables).toContain('machines_catalogue'); // la sonde
    expect(etat.tables).toContain('machines'); // le repli
  });

  it('n’envoie AUCUN filtre de prix, plutôt qu’un filtre qui échouerait', async () => {
    // `price` est stocké en texte : sans la vue, gte('price_num') provoquerait
    // une erreur 400 et viderait toute la page.
    const r = await chercherMachines({ prixMin: '1000', prixMax: '9000' }, 0, 20);
    expect(r.prixCoteBase).toBe(false);
    expect(appels().some((a) => a.methode === 'gte')).toBe(false);
  });

  it('ne trie pas par prix sur du texte : « 1 250 000 » passerait avant « 95 000 »', async () => {
    await chercherMachines({ tri: 'price-asc' }, 0, 20);
    expect(aAppele('order', 'price_num')).toBe(false);
    expect(aAppele('order', 'created_at')).toBe(true);
  });
});

describe('quand la migration p33 EST appliquée', () => {
  it('filtre et trie le prix côté base', async () => {
    const r = await chercherMachines({ prixMin: '1000', prixMax: '9000', tri: 'price-asc' }, 0, 20);
    expect(r.prixCoteBase).toBe(true);
    expect(aAppele('gte', 'price_num', 1000)).toBe(true);
    expect(aAppele('lte', 'price_num', 9000)).toBe(true);
    expect(aAppele('order', 'price_num')).toBe(true);
  });
});

describe('chargerFacettes', () => {
  it('rend les listes complètes quand la fonction existe', async () => {
    etat.rpc = {
      data: { marques: [{ valeur: 'Volvo', nombre: 583 }], categories: [], total: 16397 },
      error: null,
    };
    const f = await chargerFacettes();
    expect(f?.marques[0]).toEqual({ valeur: 'Volvo', nombre: 583 });
  });

  it('rend null si la fonction n’existe pas encore, sans faire de bruit', async () => {
    etat.rpc = { data: null, error: { code: 'PGRST202', message: 'not found' } };
    expect(await chargerFacettes()).toBeNull();
  });

  it('ne recalcule pas les facettes à chaque appel', async () => {
    let appelsRpc = 0;
    etat.rpc = { data: { marques: [], categories: [], total: 0 }, error: null };
    const espion = vi.fn(() => {
      appelsRpc += 1;
      return Promise.resolve(etat.rpc);
    });
    // On remplace la RPC par un espion le temps du test.
    const mod = await import('../supabaseClient');
    (mod.default as unknown as { rpc: unknown }).rpc = espion;
    reinitialiserDetection();
    await chargerFacettes();
    await chargerFacettes();
    await chargerFacettes();
    expect(appelsRpc).toBe(1);
  });
});
