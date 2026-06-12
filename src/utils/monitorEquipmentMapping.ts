import type { EquipmentNeed } from '../types/monitor';
import { categories } from '../data/categories';

export type MarketplaceEquipmentLink = {
  marketplace_category_name: string;
  marketplace_subcategory_id: string;
  marketplace_label: string;
};

/**
 * Slugs internes monitor / inférence → id sous-catégorie du catalogue (`src/data/categories.ts`).
 * Les clés sont en snake_case comme dans `TYPE_EQUIPMENT_TEMPLATES` (ProjectDetails).
 */
const MONITOR_SLUG_TO_SUBCATEGORY_ID: Record<string, string> = {
  /** Slugs FR (inférence front) */
  excavatrice: 'pelle-chenilles',
  camion_benne: 'camion-benne',
  bulldozer: 'pelle-chenilles',
  forage: 'foreuse-hydraulique',
  chargeuse: 'chariot-elevateur',
  niveleuse: 'niveleuse',
  pelle_hydraulique: 'pelle-chenilles',
  grue_mobile: 'grue-mobile',
  nacelle: 'telescopique',
  betonniere: 'camion-melangeur',
  compacteur: 'compacteur-monocylindre',
  finisseur: 'finisseur',
  chariot_telecopique: 'telescopique',
  /** Pas d’équivalent direct : lien vers BRH (BTP / outillage). */
  compresseur: 'brh',
  /** Clés EN rules engine + LLM (`equipment_rules.json`, `EQUIPMENT_PROMPT`) */
  excavator: 'pelle-chenilles',
  tracked_excavator: 'pelle-chenilles',
  wheel_excavator: 'pelle-pneus',
  loader: 'chariot-elevateur',
  dozer: 'pelle-chenilles',
  grader: 'niveleuse',
  compactor: 'compacteur-monocylindre',
  dump_truck: 'camion-benne',
  crusher: 'concasseur-mobile',
  drill: 'foreuse-hydraulique',
  mobile_crane: 'grue-mobile',
  telehandler: 'telescopique',
  aerial_platform: 'telescopique',
  paver: 'finisseur',
  concrete_mixer: 'camion-melangeur',
  concrete_pump: 'camion-melangeur',
  asphalt_plant: 'repandeuse',
  batching_plant: 'camion-melangeur',
  generator: 'foreuse-hydraulique',
  water_truck: 'camion-benne',
};

function findSubcategoryById(subId: string): { categoryName: string; sub: { id: string; name: string } } | null {
  for (const cat of categories) {
    const sub = cat.subcategories?.find((s) => s.id === subId);
    if (sub) {
      return { categoryName: cat.name, sub };
    }
  }
  return null;
}

/**
 * Résout un besoin monitor (slug ou déjà un id catalogue) vers le triplet utilisé par les liens Machines.
 */
export function resolveMonitorEquipmentToMarketplace(
  monitorCategory: string | null | undefined,
): MarketplaceEquipmentLink | null {
  if (!monitorCategory) return null;
  const raw = monitorCategory.toLowerCase().trim();

  const direct = findSubcategoryById(raw);
  if (direct) {
    return {
      marketplace_category_name: direct.categoryName,
      marketplace_subcategory_id: direct.sub.id,
      marketplace_label: direct.sub.name,
    };
  }
  const hyphen = raw.replace(/_/g, '-');
  const fromHyphen = findSubcategoryById(hyphen);
  if (fromHyphen) {
    return {
      marketplace_category_name: fromHyphen.categoryName,
      marketplace_subcategory_id: fromHyphen.sub.id,
      marketplace_label: fromHyphen.sub.name,
    };
  }

  const subId = MONITOR_SLUG_TO_SUBCATEGORY_ID[raw] ?? MONITOR_SLUG_TO_SUBCATEGORY_ID[raw.replace(/-/g, '_')];
  if (!subId) return null;

  const found = findSubcategoryById(subId);
  if (!found) return null;

  return {
    marketplace_category_name: found.categoryName,
    marketplace_subcategory_id: found.sub.id,
    marketplace_label: found.sub.name,
  };
}

export function enrichEquipmentNeed(eq: EquipmentNeed): EquipmentNeed {
  const link = resolveMonitorEquipmentToMarketplace(eq.category);
  if (!link) return eq;
  return {
    ...eq,
    marketplace_category_name: link.marketplace_category_name,
    marketplace_subcategory_id: link.marketplace_subcategory_id,
    marketplace_label: link.marketplace_label,
  };
}

export function machinesCatalogHref(link: MarketplaceEquipmentLink): string {
  return `#machines?machine=${encodeURIComponent(link.marketplace_category_name)}&type=${encodeURIComponent(link.marketplace_subcategory_id)}`;
}
