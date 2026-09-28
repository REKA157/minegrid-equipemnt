/**
 * Lecture défensive d'une fiche machine, sortie de MachineDetail.tsx
 * (1 166 lignes).
 *
 * POURQUOI CES FONCTIONS COMPTENT
 * -------------------------------
 * La table `machines` porte QUATRE colonnes concurrentes pour désigner le
 * vendeur — `seller_id`, `sellerid`, `user_id`, `owner_id` — héritage de
 * migrations successives. `resolveSellerUuidFromMachineRecord` tranche entre
 * elles, et écarte les identifiants factices (`00000000-…`) laissés par des
 * imports de démonstration.
 *
 * Ce n'est pas de l'affichage : ce choix décide À QUI part la demande de devis
 * d'un client. Se tromper, c'est envoyer un prospect au mauvais vendeur, ou à
 * personne. La priorité des colonnes est alignée sur celle de la fonction
 * serveur `send-contact-email` — les deux doivent rester d'accord.
 *
 * Aucun test ne les couvrait : il fallait monter toute la page. Aucun
 * comportement n'a été modifié pendant le déplacement.
 */

import { parseSellerUuid } from '../utils/api/quoteRequests';

export interface MachineLegacyFields {
  sellerid?: string | null;
  seller_id?: string | null;
  user_id?: string | null;
  owner_id?: string | null;
  photos?: string[] | null;
}

export interface DimensionsLike {
  length?: string | number;
  width?: string | number;
  height?: string | number;
}

export function getLegacySellerId(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const v = value as MachineLegacyFields;
  return v.sellerid || v.seller_id || v.user_id || v.owner_id || '';
}

export const PLACEHOLDER_SELLER_IDS = new Set([
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
]);

export function isPlaceholderSellerUuid(id: string): boolean {
  return PLACEHOLDER_SELLER_IDS.has(id.trim().toLowerCase());
}

/** Priorité alignée avec send-contact-email */
export function resolveSellerUuidFromMachineRecord(row: Record<string, unknown>): string | null {
  const keys = ['seller_id', 'sellerid', 'user_id', 'owner_id'] as const;
  for (const k of keys) {
    const raw = row[k];
    if (typeof raw !== 'string') continue;
    const uuid = parseSellerUuid(raw);
    if (uuid && !isPlaceholderSellerUuid(uuid)) return uuid;
  }
  return null;
}

export function getLegacyPhotos(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as MachineLegacyFields;
  return Array.isArray(v.photos) ? v.photos : [];
}

export function getDimensionsVolume(dimensions: unknown): number | undefined {
  if (!dimensions || typeof dimensions !== 'object') return undefined;
  const { length, width, height } = dimensions as DimensionsLike;
  const l = parseFloat(String(length ?? '0'));
  const w = parseFloat(String(width ?? '0'));
  const h = parseFloat(String(height ?? '0'));
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  const volume = l * w * h;
  return volume > 0 ? volume : undefined;
}
