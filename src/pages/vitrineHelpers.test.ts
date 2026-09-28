/**
 * Le premier bloc de tests verrouille la correction d'un défaut RÉEL : la
 * lecture de l'identifiant vendeur tronquait les UUID au premier tiret, et
 * toute vitrine partagée par un vendeur s'ouvrait donc vide.
 *
 * Le test qui existait auparavant passait au travers parce qu'il utilisait
 * `#vitrine/vendeur1` — une valeur sans tiret, commode mais irréelle. D'où le
 * choix, ici, de n'employer que de vrais UUID.
 */

import { describe, it, expect } from 'vitest';
import {
  lireIdentifiantVendeurDepuisHash,
  isValidImageUrl,
  getDefaultImageForCategory,
  FORMULAIRE_LOCATION_VIDE,
} from './vitrineHelpers';

const UUID = '3f2b1c4a-9d7e-4f11-8a20-0b6c5d4e3f21';

describe('lireIdentifiantVendeurDepuisHash', () => {
  it('rend un UUID ENTIER, tirets compris', () => {
    // LE test. L'ancienne regex utilisait \w, qui exclut le tiret, et rendait
    // « 3f2b1c4a ». Aucune ligne ne correspondait, la page s'affichait vide.
    expect(lireIdentifiantVendeurDepuisHash(`#vitrine/${UUID}`)).toBe(UUID);
  });

  it('ne tronque pas au premier tiret', () => {
    const r = lireIdentifiantVendeurDepuisHash(`#vitrine/${UUID}`);
    expect(r).not.toBe('3f2b1c4a');
    expect(r).toHaveLength(36);
  });

  it('accepte encore un identifiant sans tiret', () => {
    // L'ancien format doit continuer de marcher : on corrige, on ne remplace pas.
    expect(lireIdentifiantVendeurDepuisHash('#vitrine/vendeur1')).toBe('vendeur1');
  });

  it('rend null quand aucun identifiant ne suit', () => {
    expect(lireIdentifiantVendeurDepuisHash('#vitrine')).toBeNull();
    expect(lireIdentifiantVendeurDepuisHash('#vitrine/')).toBeNull();
    expect(lireIdentifiantVendeurDepuisHash('')).toBeNull();
  });

  it('rend null sur une autre route', () => {
    expect(lireIdentifiantVendeurDepuisHash('#dashboard/annonces')).toBeNull();
    expect(lireIdentifiantVendeurDepuisHash('#machines/abc')).toBeNull();
  });

  it('ignore une chaîne de requête collée derrière', () => {
    expect(lireIdentifiantVendeurDepuisHash(`#vitrine/${UUID}?tab=parc`)).toBe(UUID);
  });

  it('ignore un segment supplémentaire', () => {
    expect(lireIdentifiantVendeurDepuisHash(`#vitrine/${UUID}/machines`)).toBe(UUID);
  });
});

describe('isValidImageUrl', () => {
  it('accepte une URL de stockage réelle', () => {
    expect(isValidImageUrl('https://x.supabase.co/storage/v1/object/public/a.jpg')).toBe(true);
  });

  it('refuse le vide, les espaces et le non-URL', () => {
    // Une URL invalide passée à une balise image déclenche une requête 404 et
    // affiche un cadre cassé sur la fiche d'un vendeur.
    expect(isValidImageUrl('')).toBe(false);
    expect(isValidImageUrl('   ')).toBe(false);
    expect(isValidImageUrl('pas-une-url')).toBe(false);
    expect(isValidImageUrl(null as unknown as string)).toBe(false);
    expect(isValidImageUrl(undefined as unknown as string)).toBe(false);
  });
});

describe('getDefaultImageForCategory', () => {
  it('donne la même image aux synonymes français et anglais', () => {
    const attendu = getDefaultImageForCategory('excavator')[0];
    expect(getDefaultImageForCategory('excavatrice')[0]).toBe(attendu);
    expect(getDefaultImageForCategory('pelle')[0]).toBe(attendu);
  });

  it('ignore la casse et les espaces', () => {
    expect(getDefaultImageForCategory('  PELLE  ')).toEqual(getDefaultImageForCategory('pelle'));
  });

  it('retombe sur « construction » pour une catégorie inconnue, jamais undefined', () => {
    // Un undefined ici affiche un cadre vide à la place de la machine.
    const r = getDefaultImageForCategory('catégorie-inexistante');
    expect(r).toEqual(getDefaultImageForCategory('construction'));
    expect(r[0]).toBeTruthy();
  });

  it('rend toujours un tableau d’exactement une image', () => {
    for (const c of ['pelle', 'inconnu', '', '   ']) {
      expect(getDefaultImageForCategory(c)).toHaveLength(1);
      expect(typeof getDefaultImageForCategory(c)[0]).toBe('string');
    }
  });
});

describe('FORMULAIRE_LOCATION_VIDE', () => {
  it('part sans aucune option payante cochée', () => {
    // Transport, chauffeur et maintenance sont facturés : les pré-cocher
    // ferait accepter au client des prestations qu'il n'a pas demandées.
    expect(FORMULAIRE_LOCATION_VIDE.transport).toBe(false);
    expect(FORMULAIRE_LOCATION_VIDE.chauffeur).toBe(false);
    expect(FORMULAIRE_LOCATION_VIDE.maintenance).toBe(false);
  });

  it('part sans identité pré-remplie', () => {
    expect(FORMULAIRE_LOCATION_VIDE.nom).toBe('');
    expect(FORMULAIRE_LOCATION_VIDE.email).toBe('');
    expect(FORMULAIRE_LOCATION_VIDE.telephone).toBe('');
  });
});
