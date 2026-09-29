/**
 * Classement d'une annonce : catégorie brute → sous-type, groupe, secteur métier.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Cette logique vivait dans `Machines.tsx`, appliquée ligne par ligne aux
 * annonces DÉJÀ téléchargées. C'était tenable tant que le filtrage se faisait
 * dans le navigateur — et c'est précisément ce qui rendait 82 % du catalogue
 * introuvable (mesuré le 2026-09-29 : 16 397 annonces en base, 3 000 au maximum
 * chargées).
 *
 * Pour demander à la BASE « donne-moi les machines du secteur Terrassement »,
 * il faut pouvoir traduire un secteur en liste de catégories brutes. C'est le
 * rôle de `categoriesDuSecteur` et `categoriesDuGroupe` ci-dessous. La
 * classification devait donc devenir appelable sur une simple chaîne, hors de
 * tout rendu.
 *
 * La base ne contient que 52 catégories distinctes pour 16 397 annonces
 * (relevé du 2026-09-29) : traduire un secteur en liste de catégories reste
 * donc une requête courte.
 */

import { categories } from '../data/categories';
import { DEFAULT_JOB_SECTOR, GROUP_TO_JOB_SECTOR } from '../data/sectors';

/** sous-type (ex. « pelle-chenilles ») → nom du groupe, en minuscules. */
export const sousTypeVersGroupe = new Map<string, string>();
/** sous-type → libellé lisible (ex. « Pelle sur chenilles »). */
export const sousTypeVersLibelle = new Map<string, string>();
/** libellé en minuscules → identifiant de sous-type. */
export const libelleVersSousType: Record<string, string> = {};

categories.forEach((groupe) => {
  (groupe.subcategories || []).forEach((sous) => {
    const id = String(sous.id || '').toLowerCase();
    sousTypeVersGroupe.set(id, String(groupe.name || '').toLowerCase());
    sousTypeVersLibelle.set(id, String(sous.name || ''));
    libelleVersSousType[String(sous.name || '').toLowerCase()] = id;
  });
});

/**
 * Catégories telles que les écrit la source Mascus, d'où viennent 99 % des
 * annonces. Sans cette table, `crawlerexcavators` ne serait rattaché à aucun
 * groupe et l'annonce tomberait dans le secteur par défaut.
 */
export const ALIAS_CATEGORIES_MASCUS: Record<string, string> = {
  crawlerexcavators: 'pelle-chenilles',
  wheeledexcavators: 'pelle-pneus',
  wheelloaders: 'chargeuse-pneus',
  backhoeloaders: 'chargeuse-pelleteuse',
  dozers: 'bulldozer',
  motorgraders: 'niveleuse',
  dumptrucks: 'camion-benne',
  articulateddumptrucks: 'camion-benne',
  rigiddumptrucks: 'tombereau-rigide',
  singledrumrollers: 'compacteur-monocylindre',
  tandemrollers: 'compacteur-tandem',
  forklifts: 'chariot-elevateur',
  telehandlers: 'telescopique',
  asphaltpavers: 'finisseur',
  generators: 'groupe-electrogene',
  compressors: 'compresseur',
  concretemixers: 'camion-melangeur',
  crushers: 'concasseur',
  screeners: 'crible',
  drillingrigs: 'foreuse',
  tractors: 'tracteur-routier',
};

export interface ClassementMachine {
  /** Sous-type normalisé, après passage par les alias. */
  sousType: string;
  /** Nom du groupe de catalogue, en minuscules. Vide si inconnu. */
  groupe: string;
  /** Libellé lisible du type. */
  libelle: string;
  /** Secteur métier. Toujours renseigné (valeur par défaut si inconnu). */
  secteur: string;
}

/**
 * Classe une annonce à partir de sa catégorie brute.
 *
 * `type` et `nomCategorie` sont des replis utilisés quand la catégorie brute
 * ne correspond à aucun sous-type connu — c'est le cas des annonces saisies à
 * la main, où la catégorie porte parfois le libellé au lieu de l'identifiant.
 */
export function classerCategorie(
  categorieBrute: string | null | undefined,
  type?: string | null,
  nomCategorie?: string | null,
): ClassementMachine {
  const brute = String(categorieBrute || '').toLowerCase();
  const typeBas = String(type || '').toLowerCase();
  const nomBas = String(nomCategorie || '').toLowerCase();

  const compacte = brute.replace(/[\s_-]/g, '');
  const compacteNom = nomBas.replace(/[\s_-]/g, '');

  let sousType =
    ALIAS_CATEGORIES_MASCUS[compacte] || ALIAS_CATEGORIES_MASCUS[compacteNom] || brute;

  if (!sousTypeVersGroupe.has(sousType)) {
    sousType = libelleVersSousType[typeBas] || libelleVersSousType[brute] || sousType;
  }

  const groupe = sousTypeVersGroupe.get(sousType) || '';
  return {
    sousType,
    groupe,
    libelle: sousTypeVersLibelle.get(sousType) || type || categorieBrute || '',
    secteur: GROUP_TO_JOB_SECTOR[groupe] || DEFAULT_JOB_SECTOR,
  };
}

/**
 * Parmi les catégories réellement présentes en base, celles qui relèvent du
 * secteur demandé. C'est ce que l'on passe à la base dans un `in(...)`.
 *
 * Renvoie un tableau vide si le secteur est vide ou vaut « tous secteurs » :
 * l'appelant doit alors n'appliquer AUCUN filtre, et surtout pas un filtre
 * portant sur une liste vide, qui ne renverrait rien.
 */
export function categoriesDuSecteur(
  categoriesEnBase: string[],
  secteur: string | null | undefined,
): string[] {
  const cible = String(secteur || '').trim().toLowerCase();
  if (!cible || cible === 'tous secteurs') return [];
  return categoriesEnBase.filter(
    (c) => classerCategorie(c).secteur.toLowerCase() === cible,
  );
}

/** Idem, pour un groupe de catalogue (« Terrassement & Excavation »). */
export function categoriesDuGroupe(
  categoriesEnBase: string[],
  groupe: string | null | undefined,
): string[] {
  const cible = String(groupe || '').trim().toLowerCase();
  if (!cible) return [];
  return categoriesEnBase.filter((c) => {
    const k = classerCategorie(c);
    return k.groupe === cible || k.sousType === cible;
  });
}
