/**
 * `resolveSellerUuidFromMachineRecord` décide À QUI part la demande de devis
 * d'un client. Ces cas ne sont pas décoratifs : ils figent la priorité entre
 * quatre colonnes concurrentes et le rejet des identifiants factices.
 *
 * Aucun test ne couvrait cette logique tant qu'elle vivait au milieu des
 * 1 166 lignes de MachineDetail.tsx.
 */

import { describe, it, expect } from 'vitest';
import {
  getLegacySellerId,
  isPlaceholderSellerUuid,
  resolveSellerUuidFromMachineRecord,
  getLegacyPhotos,
  getDimensionsVolume,
} from './machineDetailHelpers';

const UUID_A = '11111111-2222-3333-4444-555555555555';
const UUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('getLegacySellerId', () => {
  it('suit la priorité sellerid > seller_id > user_id > owner_id', () => {
    expect(getLegacySellerId({ sellerid: 'a', seller_id: 'b', user_id: 'c', owner_id: 'd' })).toBe('a');
    expect(getLegacySellerId({ seller_id: 'b', user_id: 'c', owner_id: 'd' })).toBe('b');
    expect(getLegacySellerId({ user_id: 'c', owner_id: 'd' })).toBe('c');
    expect(getLegacySellerId({ owner_id: 'd' })).toBe('d');
  });

  it('ignore une colonne vide et passe à la suivante', () => {
    // Une chaîne vide en base est fréquente, et ne doit pas gagner.
    expect(getLegacySellerId({ sellerid: '', seller_id: 'b' })).toBe('b');
  });

  it('rend une chaîne vide, jamais undefined, sur une entrée absurde', () => {
    for (const v of [null, undefined, 42, 'texte', []]) {
      expect(getLegacySellerId(v)).toBe('');
    }
  });
});

describe('isPlaceholderSellerUuid', () => {
  it('reconnaît les deux identifiants factices des imports de démonstration', () => {
    expect(isPlaceholderSellerUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isPlaceholderSellerUuid('00000000-0000-0000-0000-000000000001')).toBe(true);
  });

  it('les reconnaît malgré une casse ou des espaces parasites', () => {
    expect(isPlaceholderSellerUuid('  00000000-0000-0000-0000-000000000000  ')).toBe(true);
    expect(isPlaceholderSellerUuid('00000000-0000-0000-0000-00000000000A'.toUpperCase())).toBe(false);
  });

  it('laisse passer un vrai identifiant', () => {
    expect(isPlaceholderSellerUuid(UUID_A)).toBe(false);
  });
});

describe('resolveSellerUuidFromMachineRecord', () => {
  it('suit la priorité seller_id > sellerid > user_id > owner_id', () => {
    // ATTENTION : cet ordre n'est PAS celui de getLegacySellerId. Il est aligné
    // sur la fonction serveur send-contact-email ; les deux doivent rester
    // d'accord, sinon le courriel part à un autre vendeur que l'écran n'annonce.
    expect(
      resolveSellerUuidFromMachineRecord({ seller_id: UUID_A, sellerid: UUID_B }),
    ).toBe(UUID_A);
    expect(resolveSellerUuidFromMachineRecord({ sellerid: UUID_B, user_id: UUID_A })).toBe(UUID_B);
  });

  it('écarte un identifiant factice et prend la colonne suivante', () => {
    const r = resolveSellerUuidFromMachineRecord({
      seller_id: '00000000-0000-0000-0000-000000000000',
      user_id: UUID_A,
    });
    expect(r).toBe(UUID_A);
  });

  it('rend null quand toutes les colonnes sont factices', () => {
    // null, et surtout pas l'identifiant factice : mieux vaut aucun
    // destinataire qu'un destinataire qui n'existe pas.
    expect(
      resolveSellerUuidFromMachineRecord({
        seller_id: '00000000-0000-0000-0000-000000000000',
        owner_id: '00000000-0000-0000-0000-000000000001',
      }),
    ).toBeNull();
  });

  it('rend null sur une fiche sans aucune colonne vendeur', () => {
    expect(resolveSellerUuidFromMachineRecord({})).toBeNull();
    expect(resolveSellerUuidFromMachineRecord({ name: 'CAT 320D' })).toBeNull();
  });

  it('ignore une colonne qui n’est pas une chaîne', () => {
    expect(resolveSellerUuidFromMachineRecord({ seller_id: 42, user_id: UUID_A })).toBe(UUID_A);
    expect(resolveSellerUuidFromMachineRecord({ seller_id: null, user_id: UUID_A })).toBe(UUID_A);
  });
});

describe('getLegacyPhotos', () => {
  it('rend le tableau de photos quand il existe', () => {
    expect(getLegacyPhotos({ photos: ['a.jpg', 'b.jpg'] })).toEqual(['a.jpg', 'b.jpg']);
  });

  it('rend un tableau vide plutôt que null sur toute entrée douteuse', () => {
    // Le rendu fait `.map()` dessus : un null ferait planter la fiche machine.
    for (const v of [null, undefined, {}, { photos: null }, { photos: 'a.jpg' }, 7]) {
      expect(getLegacyPhotos(v)).toEqual([]);
    }
  });
});

describe('getDimensionsVolume', () => {
  it('calcule le volume à partir de trois dimensions', () => {
    expect(getDimensionsVolume({ length: 2, width: 3, height: 4 })).toBe(24);
  });

  it('accepte des dimensions transmises en texte', () => {
    expect(getDimensionsVolume({ length: '2.5', width: '2', height: '2' })).toBe(10);
  });

  it('rend undefined si une dimension manque ou vaut zéro', () => {
    // Un volume de 0 n'est pas une information : c'est une absence de mesure.
    expect(getDimensionsVolume({ length: 2, width: 3 })).toBeUndefined();
    expect(getDimensionsVolume({ length: 0, width: 3, height: 4 })).toBeUndefined();
  });

  it('rend undefined sur une entrée illisible, jamais NaN', () => {
    expect(getDimensionsVolume(null)).toBeUndefined();
    expect(getDimensionsVolume('grand')).toBeUndefined();
    expect(getDimensionsVolume({ length: 'gros', width: 3, height: 4 })).toBeUndefined();
  });
});
