/**
 * Insight GLOBAL MONITOR ↔ STOCK (reco #7) — HONNÊTE & ANTI-FAÇADE.
 *
 * État réel : la table `market_projects` n'est PAS déployée en production (elle reste
 * dans sql/nextgen/0003_logistics_intelligence_data.sql, sous RLS `pro_clients`). Cette
 * branche est donc DORMANTE : le loader interroge la VRAIE table et ne renvoie un match
 * QUE sur des données réelles (projet récent × machine du vendeur compatible). En prod
 * aujourd'hui -> table absente/vide -> [] -> AUCUN insight affiché (jamais de faux projet).
 *
 * La logique de correspondance (matchProjectsToStock) est PURE, déterministe et testée :
 * elle est prête à s'activer le jour où 0003 est déployé, sans rien inventer entre-temps.
 */
import supabase from '../supabaseClient';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from '../enterpriseApi/sellerScope';

export interface ProjectRow {
  id: string;
  title?: string | null;
  sector?: string | null;
  country?: string | null;
}

export interface StockMachine {
  id: string;
  title: string;
  category?: string | null;
  country?: string | null;
}

export interface ProjectStockMatch {
  projectId: string;
  projectTitle: string;
  machineId: string;
  machineTitle: string;
}

// Mots-clés d'engins par secteur de projet (lookup explicite et déterministe — PAS un
// score inventé). Un secteur non mappé ne produit AUCUN match (anti-façade).
const SECTOR_KEYWORDS: Record<string, string[]> = {
  mining: ['pelle', 'excavat', 'tombereau', 'dumper', 'foreuse', 'concasseur', 'chargeuse', 'bulldozer'],
  btp: ['pelle', 'excavat', 'chargeuse', 'bulldozer', 'niveleuse', 'compacteur', 'grue', 'nacelle'],
  infrastructure: ['pelle', 'excavat', 'chargeuse', 'bulldozer', 'niveleuse', 'compacteur', 'grue'],
  energy: ['grue', 'nacelle', 'pelle', 'excavat', 'chargeuse'],
};

function norm(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

/**
 * PUR : associe un projet à UNE machine compatible du stock vendeur. Compatibilité =
 * secteur mappé + mot-clé d'engin présent dans (category|titre) ; si les deux pays sont
 * connus, ils doivent être identiques. Aucun secteur mappé / aucun mot-clé -> pas de match.
 */
export function matchProjectsToStock(projects: ProjectRow[], machines: StockMachine[]): ProjectStockMatch[] {
  const out: ProjectStockMatch[] = [];
  for (const p of projects) {
    const keywords = SECTOR_KEYWORDS[norm(p.sector)];
    if (!keywords || !keywords.length) continue; // secteur non mappé -> aucun match inventé
    const pCountry = norm(p.country);
    for (const m of machines) {
      const hay = `${norm(m.category)} ${norm(m.title)}`;
      if (!keywords.some((k) => hay.includes(k))) continue;
      const mCountry = norm(m.country);
      if (pCountry && mCountry && pCountry !== mCountry) continue; // pays connus et différents
      out.push({ projectId: p.id, projectTitle: p.title?.trim() || 'Projet', machineId: m.id, machineTitle: m.title });
      break; // une machine compatible suffit par projet
    }
  }
  return out;
}

export async function loadMarketProjectMatches(): Promise<ProjectStockMatch[]> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return [];
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return [];

    // market_projects : NON déployée en prod -> requête tolérante (catch -> []).
    const projRes = await supabase.from('market_projects').select('id, title, sector, country').limit(20);
    const projects = (projRes.data ?? []) as ProjectRow[];
    if (!projects.length) return []; // dormant tant que 0003 n'est pas déployé/peuplé

    const machRes = await supabase
      .from('machines')
      .select('id, brand, model, category, country, status')
      .in('id', machineIds);
    const machines: StockMachine[] = ((machRes.data ?? []) as Array<{
      id: string;
      brand?: string | null;
      model?: string | null;
      category?: string | null;
      country?: string | null;
      status?: string | null;
    }>)
      .filter((m) => (m.status ?? 'available') === 'available')
      .map((m) => ({
        id: m.id,
        title: [m.brand, m.model].filter(Boolean).join(' ') || m.id,
        category: m.category,
        country: m.country,
      }));

    return matchProjectsToStock(projects, machines).slice(0, 3);
  } catch {
    return [];
  }
}
