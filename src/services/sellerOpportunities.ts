// =====================================================================
// Chargement des OPPORTUNITÉS DE VENTE pour le vendeur connecté.
// Orchestration (impure) autour du moteur PUR rankSalesOpportunities :
//   1) stock du vendeur (catégories réelles) ;
//   2) liste des AO du Global Monitor ;
//   3) détail (besoins + contacts) d'un lot borné, en parallèle ;
//   4) classement en opportunités.
// États HONNÊTES : pas de stock / monitor injoignable / aucun match / ok.
// Aucune donnée inventée : si le monitor n'est pas déployé, on le DIT.
// =====================================================================
import { fetchProjects, fetchProjectDetail } from './monitorApi';
import type { ProjectListResponse } from '../types/monitor';
import { loadSellerStockCategories } from '../utils/monitorProspectMatch';
import { rankSalesOpportunities, type OpportunityInput, type SalesOpportunity } from '../utils/salesOpportunities';

export type SellerOpportunitiesResult =
  | { status: 'ok'; opportunities: SalesOpportunity[]; scanned: number; stockCount: number }
  | { status: 'no_stock' }
  | { status: 'monitor_offline'; error: string }
  | { status: 'empty'; scanned: number; stockCount: number };

export interface LoadOpportunitiesOptions {
  /** Nombre d'AO listés (défaut 60). */
  listSize?: number;
  /** Nombre d'AO dont on charge le détail (besoins) — borné pour limiter les requêtes (défaut 24). */
  detailLimit?: number;
  /** Nombre d'opportunités renvoyées (défaut 10). */
  limit?: number;
}

/** map avec concurrence bornée (évite d'ouvrir 24 requêtes d'un coup). */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadSellerOpportunities(
  opts: LoadOpportunitiesOptions = {},
): Promise<SellerOpportunitiesResult> {
  const listSize = opts.listSize ?? 60;
  const detailLimit = opts.detailLimit ?? 24;
  const limit = opts.limit ?? 10;

  const stock = await loadSellerStockCategories();
  if (!stock.length) return { status: 'no_stock' };

  let list: ProjectListResponse;
  try {
    list = await fetchProjects({}, 1, listSize);
  } catch (e) {
    return { status: 'monitor_offline', error: e instanceof Error ? e.message : 'service indisponible' };
  }

  const ids = (list.items ?? []).slice(0, detailLimit).map((p) => p.id);
  // withAi=false : on lit les besoins DÉJÀ calculés (pas de recompute LLM par requête).
  const details = await mapWithConcurrency(ids, 6, async (id) => {
    try {
      return await fetchProjectDetail(id, false, false);
    } catch {
      return null;
    }
  });
  const inputs = details.filter((d): d is NonNullable<typeof d> => !!d) as OpportunityInput[];

  const opportunities = rankSalesOpportunities(inputs, stock, { limit });
  if (!opportunities.length) {
    return { status: 'empty', scanned: inputs.length, stockCount: stock.length };
  }
  return { status: 'ok', opportunities, scanned: inputs.length, stockCount: stock.length };
}
