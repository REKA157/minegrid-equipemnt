/**
 * Ces tests couvrent `SEQ-05` / `CTR-05` de l'audit du 2026-09-29.
 *
 * LE DÉFAUT. Sur les 16 397 annonces de production, **13 717 (83,7 %)** portent
 * le vendeur fictif `00000000-0000-0000-0000-000000000001`, laissé par l'import
 * automatique du catalogue. Ce compte n'existe pas.
 *
 * Un filtre de ce vendeur fantôme existait déjà à DEUX endroits — la fiche
 * machine (`machineDetailHelpers.ts`) et la fonction serveur
 * `send-contact-email` — mais **pas sur le chemin qui crée réellement la
 * demande de devis et le dossier transactionnel**. `parseSellerUuid` ne
 * validait que le format de l'identifiant.
 *
 * Conséquence : une demande de devis sur l'une de ces 13 717 annonces partait
 * vers un vendeur inexistant. L'acheteur lisait « demande envoyée ». Personne
 * ne la recevait.
 */

import { describe, it, expect } from 'vitest';
import { parseSellerUuid, estVendeurFictif } from './quoteRequests';

const VENDEUR_REEL = '3f2b1c4a-9d7e-4f11-8a20-0b6c5d4e3f21';
const FICTIF_1 = '00000000-0000-0000-0000-000000000001'; // 13 717 annonces
const FICTIF_0 = '00000000-0000-0000-0000-000000000000';

describe('estVendeurFictif', () => {
  it('reconnaît les deux identifiants de l’import automatique', () => {
    expect(estVendeurFictif(FICTIF_1)).toBe(true);
    expect(estVendeurFictif(FICTIF_0)).toBe(true);
  });

  it('les reconnaît malgré la casse et les espaces', () => {
    expect(estVendeurFictif(`  ${FICTIF_1.toUpperCase()}  `)).toBe(true);
  });

  it('laisse passer un vendeur réel', () => {
    expect(estVendeurFictif(VENDEUR_REEL)).toBe(false);
  });

  it('ne casse pas sur une entrée absurde', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(estVendeurFictif(v)).toBe(false);
    }
  });
});

describe('parseSellerUuid — le garde-fou du parcours de devis', () => {
  it('REJETTE le vendeur fictif qui porte 83,7 % du catalogue', () => {
    // LE test. Avant correction, cette fonction rendait l'identifiant tel quel
    // parce qu'il a la forme d'un UUID valide — et la demande partait dans le vide.
    expect(parseSellerUuid(FICTIF_1)).toBeNull();
    expect(parseSellerUuid(FICTIF_0)).toBeNull();
  });

  it('accepte un vendeur réel', () => {
    expect(parseSellerUuid(VENDEUR_REEL)).toBe(VENDEUR_REEL);
  });

  it('accepte un vendeur réel entouré d’espaces', () => {
    expect(parseSellerUuid(`  ${VENDEUR_REEL}  `)).toBe(VENDEUR_REEL);
  });

  it('rejette ce qui n’est pas un UUID', () => {
    for (const v of ['', 'pas-un-uuid', '1234', null, undefined, 42]) {
      expect(parseSellerUuid(v)).toBeNull();
    }
  });

  it('rend null plutôt qu’un identifiant douteux : mieux vaut pas de destinataire qu’un faux', () => {
    // Le code appelant sait traiter l'absence de vendeur. Il ne sait pas
    // traiter un vendeur qui n'existe pas : il crée un dossier orphelin.
    expect(parseSellerUuid(FICTIF_1)).toBeNull();
  });
});
