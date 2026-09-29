/**
 * Recherche du catalogue CÔTÉ BASE.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Mesuré sur la production le 2026-09-29 : 16 397 annonces en base, mais la
 * page « Machines » n'en téléchargeait que 400 (3 000 au maximum en cliquant
 * « Charger plus »), et faisait ensuite le filtrage, la recherche et le tri
 * DANS LE NAVIGATEUR, sur ces lignes-là seulement. Conséquences constatées :
 *
 *   - 13 397 annonces (82 %) n'étaient atteignables par aucun filtre ;
 *   - le menu « Marque » proposait 44 marques sur les 449 réellement en base ;
 *   - chercher « Hitachi » affichait « aucun résultat » alors que 113 Hitachi
 *     étaient en vente.
 *
 * La base, elle, n'était pas en cause : elle répond en 0,23 s sur la première
 * ligne et 0,27 s sur la 16 000e. On ne lui demandait simplement jamais de
 * filtrer. Ce module le fait.
 *
 * FONCTIONNE AVANT ET APRÈS LA MIGRATION p33
 * ------------------------------------------
 * La migration `20260929100000_p33_recherche_catalogue.sql` ajoute une vue
 * `machines_catalogue` (avec un prix converti en nombre) et une fonction
 * `catalogue_facettes()` (listes complètes des marques et catégories).
 * Tant qu'elle n'est pas appliquée, ce module le détecte une fois et retombe
 * sur la table `machines` : tout marche, seuls le filtre et le tri par PRIX
 * restent limités aux annonces chargées. Le reste — recherche, marque,
 * catégorie, année, état — passe côté base dans les deux cas.
 */

import supabase from '../supabaseClient';
import { MACHINE_LIST_COLUMNS } from '../../constants/machineQueryFields';

/** Ce que l'utilisateur a saisi dans les filtres de la page catalogue. */
export interface CriteresCatalogue {
  recherche?: string;
  marque?: string;
  /** Valeurs BRUTES de la colonne `category` à retenir (déjà traduites par l'appelant). */
  categories?: string[];
  etat?: string;
  anneeMin?: string;
  anneeMax?: string;
  prixMin?: string;
  prixMax?: string;
  tri?: 'recent' | 'price-asc' | 'name';
}

export interface PageCatalogue {
  lignes: unknown[];
  /** Nombre TOTAL d'annonces correspondant aux critères, pas seulement celles rendues. */
  total: number | null;
  erreur: string | null;
  /** Vrai si le prix a été filtré côté base (migration p33 appliquée). */
  prixCoteBase: boolean;
}

/** Un nombre, ou null si la saisie n'en est pas un. Jamais NaN. */
function nombreOuNull(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Échappe ce que l'utilisateur tape avant de l'insérer dans un `or(...)`.
 *
 * PostgREST construit ses filtres à partir d'une chaîne : une virgule ou une
 * parenthèse dans la recherche casserait la requête, et un `*` élargirait le
 * motif à l'insu de l'utilisateur. On les retire plutôt que de les interpréter.
 */
export function assainirRecherche(saisie: string): string {
  return saisie
    .replace(/[(),*"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    // Le `trim` vient APRÈS le remplacement, et non avant : sinon « cat* »
    // devient « cat » suivi d'une espace, et le motif `%cat %` ne correspond
    // plus à rien. Défaut attrapé par le test, pas par la relecture.
    .trim()
    .slice(0, 80)
    .trim();
}

/**
 * Détection, une seule fois par session, de la présence de la migration p33.
 * On ne la refait pas à chaque frappe : une promesse mémorisée suffit.
 */
let sondeVue: Promise<boolean> | null = null;
export function reinitialiserDetection(): void {
  sondeVue = null;
  facettesEnCache = null;
}

async function vueDisponible(): Promise<boolean> {
  if (!sondeVue) {
    sondeVue = (async () => {
      const { error } = await supabase
        .from('machines_catalogue')
        .select('id')
        .limit(1);
      // PGRST205 = la vue n'existe pas. Toute autre erreur (réseau, RLS) ne
      // doit PAS conclure à son absence : on retentera à la prochaine session.
      if (error && /PGRST205|does not exist/i.test(`${error.code} ${error.message}`)) {
        console.info(
          '[catalogue] migration p33 non appliquée : le filtre et le tri par prix ' +
            'resteront limités aux annonces chargées. Les autres filtres passent bien côté base.',
        );
        return false;
      }
      return !error;
    })();
  }
  return sondeVue;
}

/**
 * Une page de résultats, filtrée et triée PAR LA BASE.
 *
 * `total` vient de l'en-tête de comptage de PostgREST : c'est le nombre réel
 * de correspondances dans les 16 397 annonces, pas le nombre affiché. C'est ce
 * qui permet d'écrire « 113 annonces trouvées » au lieu de laisser croire que
 * les 20 visibles sont tout le stock.
 */
export async function chercherMachines(
  criteres: CriteresCatalogue,
  offset: number,
  taille: number,
): Promise<PageCatalogue> {
  const avecVue = await vueDisponible();
  const source = avecVue ? 'machines_catalogue' : 'machines';

  let q = supabase
    .from(source)
    .select(MACHINE_LIST_COLUMNS, { count: 'exact' });

  const recherche = assainirRecherche(criteres.recherche ?? '');
  if (recherche) {
    // Le même mot est cherché dans le nom, la marque, le modèle et la
    // description : un acheteur tape « pelle Komatsu » sans savoir dans quelle
    // colonne c'est rangé.
    const motif = `%${recherche}%`;
    q = q.or(
      [
        `name.ilike.${motif}`,
        `brand.ilike.${motif}`,
        `model.ilike.${motif}`,
        `description.ilike.${motif}`,
      ].join(','),
    );
  }

  if (criteres.marque) {
    // `ilike` sans joker = égalité insensible à la casse. « volvo » trouve « Volvo ».
    q = q.ilike('brand', criteres.marque);
  }

  if (criteres.categories && criteres.categories.length > 0) {
    q = q.in('category', criteres.categories);
  }

  if (criteres.etat && criteres.etat !== 'all') {
    q = q.eq('condition', criteres.etat);
  }

  const anneeMin = nombreOuNull(criteres.anneeMin);
  const anneeMax = nombreOuNull(criteres.anneeMax);
  if (anneeMin !== null) q = q.gte('year', anneeMin);
  if (anneeMax !== null) q = q.lte('year', anneeMax);

  const prixMin = nombreOuNull(criteres.prixMin);
  const prixMax = nombreOuNull(criteres.prixMax);
  if (avecVue) {
    // `price` est stocké en TEXTE : seule la vue expose une version numérique.
    if (prixMin !== null) q = q.gte('price_num', prixMin);
    if (prixMax !== null) q = q.lte('price_num', prixMax);
  }

  switch (criteres.tri) {
    case 'price-asc':
      q = avecVue
        ? q.order('price_num', { ascending: true, nullsFirst: false })
        // Sans la vue, trier sur le texte donnerait « 1 250 000 » avant
        // « 95 000 ». On préfère l'ordre par date, qui ne ment pas, et
        // l'appelant retriera la page en mémoire.
        : q.order('created_at', { ascending: false });
      break;
    case 'name':
      q = q.order('name', { ascending: true });
      break;
    default:
      q = q.order('created_at', { ascending: false });
  }

  const { data, error, count } = await q.range(offset, offset + taille - 1);

  if (error) {
    console.error('[catalogue] recherche en échec :', error);
    return { lignes: [], total: null, erreur: error.message, prixCoteBase: avecVue };
  }
  return { lignes: data ?? [], total: count ?? null, erreur: null, prixCoteBase: avecVue };
}

export interface Facette {
  valeur: string;
  nombre: number;
}

let facettesEnCache: Promise<{ marques: Facette[]; categories: Facette[] } | null> | null = null;

/**
 * Listes COMPLÈTES des marques et catégories, avec le nombre d'annonces.
 *
 * Renvoie `null` si la migration p33 n'est pas appliquée : l'appelant retombe
 * alors sur l'ancien comportement (listes construites depuis les annonces
 * chargées). Mis en cache pour la session : ces listes bougent peu, et les
 * recalculer à chaque frappe serait absurde.
 */
export async function chargerFacettes(): Promise<{
  marques: Facette[];
  categories: Facette[];
} | null> {
  if (!facettesEnCache) {
    facettesEnCache = (async () => {
      const { data, error } = await supabase.rpc('catalogue_facettes');
      if (error) {
        // PGRST202 = la fonction n'existe pas encore.
        if (!/PGRST202/i.test(`${error.code} ${error.message}`)) {
          console.warn('[catalogue] facettes indisponibles :', error.message);
        }
        return null;
      }
      const brut = data as { marques?: Facette[]; categories?: Facette[] } | null;
      if (!brut) return null;
      return {
        marques: Array.isArray(brut.marques) ? brut.marques : [],
        categories: Array.isArray(brut.categories) ? brut.categories : [],
      };
    })();
  }
  return facettesEnCache;
}
