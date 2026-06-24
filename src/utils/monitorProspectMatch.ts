/**
 * Enrichit un prospect issu d'un APPEL D'OFFRES (Global Monitor) pour le rendre
 * ACTIONNABLE côté vendeur/loueur :
 *  - classifie le rôle du contact : LAURÉAT (a remporté le marché -> négociation) vs
 *    MAÎTRE D'OUVRAGE / demandeur (-> soumission) ;
 *  - croise les besoins matériel de l'AO avec le STOCK réel du vendeur.
 *
 * Les cœurs (classifyRole, prospectAngle, matchNeedsToStock, stockMatchNotesBlock) sont
 * PURS/testables ; loadSellerStockCategories lit le vrai stock (catch -> []).
 */
import supabase from './supabaseClient';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from './enterpriseApi/sellerScope';
import type { EquipmentNeed } from '../types/monitor';

export type ProspectKind = 'winner' | 'buyer' | 'unknown';

// 'adjudicataire' = celui qui a REMPORTÉ ; 'adjudicateur' = l'autorité qui ATTRIBUE (acheteur).
const WINNER_KEYS = ['attributaire', 'adjudicataire', 'laureat', 'lauréat', 'winner', 'awarded', 'contractor', 'remport'];
const BUYER_KEYS = ['client', 'acheteur', 'maitre', 'maître', 'buyer', 'owner', 'demandeur', 'adjudicateur', 'contracting', 'pouvoir adjudic'];

/** PUR : déduit si un rôle correspond au lauréat, au maître d'ouvrage, ou indéterminé. */
export function classifyRole(role: string | null | undefined): ProspectKind {
  const r = (role || '').trim().toLowerCase();
  if (!r) return 'unknown';
  if (WINNER_KEYS.some((k) => r.includes(k))) return 'winner';
  if (BUYER_KEYS.some((k) => r.includes(k))) return 'buyer';
  return 'unknown';
}

export interface ProspectAngle {
  titlePrefix: string;
  nextAction: string;
  roleNote: string | null;
}

/** PUR : libellé + action + note selon le rôle (angle commercial du prospect). */
export function prospectAngle(kind: ProspectKind): ProspectAngle {
  if (kind === 'winner') {
    return {
      titlePrefix: 'Prospect lauréat',
      nextAction: 'Négocier une vente / location avec le lauréat du marché',
      roleNote: 'Rôle : LAURÉAT (a remporté le marché) — angle : négociation directe (marché déjà attribué).',
    };
  }
  if (kind === 'buyer') {
    return {
      titlePrefix: "Prospect AO (maître d'ouvrage)",
      nextAction: "Soumissionner / contacter le maître d'ouvrage",
      roleNote: "Rôle : maître d'ouvrage / demandeur — angle : soumission à l'appel d'offres.",
    };
  }
  return {
    titlePrefix: 'Prospect AO',
    nextAction: 'Prendre contact et qualifier le besoin',
    roleNote: null,
  };
}

// --- Croisement besoins matériel de l'AO <-> stock réel du vendeur ---

// Racines (stems) d'engins : tolèrent les variantes (chargeuse/chargeur -> 'charg',
// concasseur/concassage -> 'concass', niveleuse -> 'nivel', etc.).
const ENGINE_KEYWORDS = [
  'pelle', 'excavat', 'charg', 'bulldozer', 'bouteur', 'tombereau', 'dumper',
  'nivel', 'compact', 'rouleau', 'grue', 'nacelle', 'foreuse', 'forage', 'concass',
  'crible', 'tractopelle', 'finiss', 'camion', 'benne', 'malax', 'beton', 'béton',
];

function keywordsOf(...parts: Array<string | null | undefined>): string[] {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return ENGINE_KEYWORDS.filter((k) => hay.includes(k));
}

export interface StockMatchRow {
  label: string;
  qtyMin: number | null;
  qtyMax: number | null;
  stockCount: number;
}

export interface StockMatchResult {
  rows: StockMatchRow[];
  needsCovered: number; // nb de besoins avec au moins 1 machine compatible
  needsTotal: number;
}

/**
 * PUR : pour chaque besoin de l'AO, compte les machines du vendeur compatibles (par
 * mot-clé d'engin). `stockCategories` = libellés stock (category + marque + modèle).
 */
export function matchNeedsToStock(needs: EquipmentNeed[], stockCategories: string[]): StockMatchResult {
  const stockKw = stockCategories.map((c) => keywordsOf(c));
  const rows: StockMatchRow[] = (needs ?? []).map((n) => {
    const label = n.marketplace_label || n.marketplace_category_name || n.category || 'Catégorie à préciser';
    const needKw = keywordsOf(
      n.marketplace_label,
      n.marketplace_category_name,
      n.category,
      (n.marketplace_subcategory_id || '').replace(/-/g, ' '),
    );
    let stockCount = 0;
    if (needKw.length) {
      for (const skw of stockKw) {
        if (skw.some((k) => needKw.includes(k))) stockCount += 1;
      }
    }
    return { label, qtyMin: n.qty_min, qtyMax: n.qty_max, stockCount };
  });
  const needsCovered = rows.filter((r) => r.stockCount > 0).length;
  return { rows, needsCovered, needsTotal: rows.length };
}

/** PUR : bloc de notes « Votre stock vs besoins » pour le lead. null si aucun besoin. */
export function stockMatchNotesBlock(res: StockMatchResult): string | null {
  if (!res.rows.length) return null;
  const lines = res.rows.slice(0, 10).map((r) => {
    const demand = r.qtyMin != null && r.qtyMax != null ? `${r.qtyMin}–${r.qtyMax}` : '?';
    return `· ${r.label} — ${r.stockCount} en stock / ${demand} demandé(s)`;
  });
  const head = `Votre stock vs besoins AO : compatible sur ${res.needsCovered}/${res.needsTotal} besoin(s)`;
  return [head, ...lines].join('\n');
}

/** Charge les libellés de stock (category + marque + modèle) des machines du vendeur. */
export async function loadSellerStockCategories(): Promise<string[]> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return [];
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return [];
    const { data } = await supabase.from('machines').select('category, brand, model').in('id', machineIds);
    return ((data ?? []) as Array<{ category?: string | null; brand?: string | null; model?: string | null }>).map((m) =>
      [m.category, m.brand, m.model].filter(Boolean).join(' '),
    );
  } catch {
    return [];
  }
}
