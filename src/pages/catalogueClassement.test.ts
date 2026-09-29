/**
 * Ces cas sont construits sur les CATEGORIES REELLES de la production
 * (relevé du 2026-09-29 : 52 catégories distinctes pour 16 397 annonces),
 * pas sur des valeurs inventées. C'est ce qui rend le test utile : il
 * décrit ce que la base contient vraiment.
 */

import { describe, it, expect } from 'vitest';
import { classerCategorie, categoriesDuSecteur, categoriesDuGroupe } from './catalogueClassement';

/** Les catégories réellement présentes en production, avec leur volume. */
const CATEGORIES_REELLES = [
  'grue-mobile', 'bulldozer', 'camion-benne', 'niveleuse', 'pelle-chenilles',
  'chargeuse-pneus', 'concasseur-mobile', 'finisseur', 'groupe-electrogene',
  'crible-mobile', 'compresseur', 'plaque-vibrante', 'grue-tour', 'trancheuse',
  'pelle-demolition', 'pelle-pneus', 'semi-remorque', 'tracteur-routier',
  'camion-plateau', 'horizontaldrillingrigs', 'heavydrills',
];

describe('classerCategorie', () => {
  it('rattache les pelles au terrassement', () => {
    for (const c of ['pelle-chenilles', 'pelle-pneus', 'pelle-demolition']) {
      expect(classerCategorie(c).secteur, c).toBe('Terrassement');
    }
  });

  it('rattache les camions au transport', () => {
    for (const c of ['camion-benne', 'semi-remorque', 'camion-plateau', 'tracteur-routier']) {
      expect(classerCategorie(c).secteur, c).toBe('Transport');
    }
  });

  it('traduit les catégories de la source Mascus', () => {
    // 99 % des annonces viennent de cette source, qui écrit les catégories en
    // anglais collé. Sans la table d'alias, elles tomberaient toutes dans le
    // secteur par défaut.
    expect(classerCategorie('crawlerexcavators').sousType).toBe('pelle-chenilles');
    expect(classerCategorie('crawlerexcavators').secteur).toBe('Terrassement');
    expect(classerCategorie('motorgraders').sousType).toBe('niveleuse');
    expect(classerCategorie('dumptrucks').secteur).toBe('Transport');
  });

  it('ignore la casse, les espaces et les tirets dans la catégorie source', () => {
    expect(classerCategorie('CrawlerExcavators').sousType).toBe('pelle-chenilles');
    expect(classerCategorie('crawler_excavators').sousType).toBe('pelle-chenilles');
    expect(classerCategorie('crawler-excavators').sousType).toBe('pelle-chenilles');
  });

  it('donne toujours un secteur, jamais vide', () => {
    for (const c of [...CATEGORIES_REELLES, '', null, undefined, 'categorie-inventee']) {
      expect(classerCategorie(c as string).secteur).toBeTruthy();
    }
  });

  it('range dans « Construction » ce qui n’appartient à aucun groupe connu', () => {
    // Comportement EXISTANT, repris à l'identique lors de l'extraction.
    // À noter : `bulldozer` (3 622 annonces) et `chargeuse-pneus` (634)
    // tombent ici, alors qu'ils relèveraient plutôt du terrassement. Les
    // reclasser déplacerait plus de 4 000 annonces d'un secteur à l'autre :
    // c'est une décision produit, pas une correction. Ce test fige l'état
    // actuel pour qu'un changement soit VOLONTAIRE et visible.
    expect(classerCategorie('bulldozer').secteur).toBe('Construction');
    expect(classerCategorie('chargeuse-pneus').secteur).toBe('Construction');
    expect(classerCategorie('heavydrills').secteur).toBe('Construction');
  });
});

describe('categoriesDuSecteur — la traduction qui permet de filtrer côté base', () => {
  it('rend les catégories réelles du secteur demandé', () => {
    expect(categoriesDuSecteur(CATEGORIES_REELLES, 'Terrassement').sort()).toEqual(
      ['pelle-chenilles', 'pelle-demolition', 'pelle-pneus'],
    );
  });

  it('ignore la casse du secteur', () => {
    expect(categoriesDuSecteur(CATEGORIES_REELLES, 'transport')).toEqual(
      categoriesDuSecteur(CATEGORIES_REELLES, 'Transport'),
    );
  });

  it('rend un tableau VIDE pour « tous secteurs » ou une saisie vide', () => {
    // Point sensible : l'appelant doit alors n'appliquer AUCUN filtre.
    // Passer une liste vide à un `in(...)` ne renverrait AUCUNE annonce —
    // le catalogue paraîtrait vide.
    expect(categoriesDuSecteur(CATEGORIES_REELLES, 'Tous secteurs')).toEqual([]);
    expect(categoriesDuSecteur(CATEGORIES_REELLES, '')).toEqual([]);
    expect(categoriesDuSecteur(CATEGORIES_REELLES, null)).toEqual([]);
  });

  it('rend un tableau vide pour un secteur qui n’existe dans aucune annonce', () => {
    expect(categoriesDuSecteur(CATEGORIES_REELLES, 'Aeronautique')).toEqual([]);
  });
});

describe('categoriesDuGroupe', () => {
  it('rend les catégories du groupe de catalogue', () => {
    expect(categoriesDuGroupe(CATEGORIES_REELLES, 'terrassement & excavation').sort()).toEqual(
      ['pelle-chenilles', 'pelle-demolition', 'pelle-pneus'],
    );
  });

  it('accepte aussi un sous-type précis', () => {
    expect(categoriesDuGroupe(CATEGORIES_REELLES, 'niveleuse')).toEqual(['niveleuse']);
  });

  it('rend un tableau vide sur une saisie vide', () => {
    expect(categoriesDuGroupe(CATEGORIES_REELLES, '')).toEqual([]);
  });
});
