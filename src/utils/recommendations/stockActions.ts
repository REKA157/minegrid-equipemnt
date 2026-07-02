/**
 * STOCK ACTIONS — « que dois-je vendre / promouvoir maintenant ? » au niveau MACHINE.
 *
 * Transforme l'inventaire passif en actions commerciales : pour chaque annonce du
 * vendeur, croise des SIGNAUX RÉELS (vues, devis, dossier, ancienneté, statut) et
 * en déduit UNE action concrète. Anti-façade : aucun signal inventé ; une machine
 * « saine » ne produit aucune action ; [] si pas de stock / pas de donnée.
 *
 * Sources réelles : machines (du vendeur) × machine_views × quote_requests × transaction_cases.
 * Le cœur (deriveStockAction) est PUR/testable ; le loader est tolérant (catch -> []).
 */
import supabase from '../supabaseClient';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from '../enterpriseApi/sellerScope';

export type StockPriority = 'high' | 'medium' | 'low';

export interface MachineLite {
  id: string;
  title: string;
  category: string | null;
}

export interface MachineSignals {
  status: string; // machines.status (available/sold/reserved/...)
  views: number; // total de vues réelles
  recentViews: number; // vues sur les 30 derniers jours
  quotes: number; // demandes de devis réelles
  hasCase: boolean; // un dossier transaction existe pour cette machine
  createdMs: number | null; // machines.created_at en ms (ancienneté de l'annonce)
}

export interface StockAction {
  machineId: string;
  title: string;
  category: string | null;
  status: string;
  action: string;
  reason: string;
  priority: StockPriority;
  href: string;
}

const MIN_VIEWS_NO_QUOTE = 10; // « beaucoup vue » avant de signaler l'absence de devis
const DORMANT_DAYS = 30; // aucune vue récente + annonce plus vieille que 30 j = dormante
const LOW_VIEWS = 5; // peu de vues = faible visibilité

/**
 * PUR : déduit l'action commerciale d'UNE machine à partir de signaux réels.
 * Seules les annonces ACTIVES (status 'available') sont actionnables pour la vente.
 * Renvoie null si la machine est saine ou non vendable (aucune action inventée).
 */
export function deriveStockAction(machine: MachineLite, sig: MachineSignals, nowMs: number): StockAction | null {
  if (sig.status !== 'available') return null;
  const base = {
    machineId: machine.id,
    title: machine.title,
    category: machine.category,
    status: sig.status,
    href: `#machines/${machine.id}`,
  };

  // 1) Devis reçu sans dossier -> transformer en dossier (plus fort signal commercial).
  if (sig.quotes >= 1 && !sig.hasCase) {
    return { ...base, action: 'Créer le dossier transaction', reason: `${sig.quotes} devis reçu(s), aucun dossier`, priority: 'high' };
  }
  // 2) Forte audience sans devis -> améliorer l'annonce / ajuster le prix.
  if (sig.views >= MIN_VIEWS_NO_QUOTE && sig.quotes === 0) {
    return { ...base, action: "Améliorer l'annonce / ajuster le prix", reason: `${sig.views} vues, aucun devis`, priority: 'high' };
  }
  // 3) Annonce dormante (aucune vue récente, annonce ancienne) -> booster la visibilité.
  const ageDays = sig.createdMs != null ? (nowMs - sig.createdMs) / 86400000 : null;
  if (sig.recentViews === 0 && ageDays != null && ageDays > DORMANT_DAYS) {
    return { ...base, action: 'Booster la visibilité', reason: 'Annonce dormante : aucune vue depuis 30 j', priority: 'medium' };
  }
  // 4) Faible visibilité (peu de vues) -> promouvoir.
  if (sig.views > 0 && sig.views < LOW_VIEWS) {
    return { ...base, action: "Promouvoir l'annonce", reason: `Faible visibilité (${sig.views} vues)`, priority: 'low' };
  }
  return null;
}

const RANK: Record<StockPriority, number> = { high: 0, medium: 1, low: 2 };

export async function loadStockActions(): Promise<StockAction[]> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return [];
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return [];

    const [machinesRes, viewsRes, quotesRes, casesRes] = await Promise.all([
      supabase.from('machines').select('id, brand, model, category, status, created_at').in('id', machineIds),
      supabase.from('machine_views').select('machine_id, created_at').in('machine_id', machineIds),
      supabase.from('quote_requests').select('machine_id, transaction_case_id').in('machine_id', machineIds),
      supabase.from('transaction_cases').select('machine_id').in('machine_id', machineIds),
    ]);

    const nowMs = Date.now();
    const recentCutoff = nowMs - DORMANT_DAYS * 86400000;

    const views = new Map<string, { total: number; recent: number }>();
    for (const v of (viewsRes.data ?? []) as Array<{ machine_id?: string | null; created_at?: string | null }>) {
      if (!v.machine_id) continue;
      const cur = views.get(v.machine_id) ?? { total: 0, recent: 0 };
      cur.total += 1;
      const t = v.created_at ? Date.parse(v.created_at) : NaN;
      if (Number.isFinite(t) && t >= recentCutoff) cur.recent += 1;
      views.set(v.machine_id, cur);
    }

    const quotes = new Map<string, number>();
    const hasCase = new Set<string>();
    for (const q of (quotesRes.data ?? []) as Array<{ machine_id?: string | null; transaction_case_id?: string | null }>) {
      if (!q.machine_id) continue;
      quotes.set(q.machine_id, (quotes.get(q.machine_id) ?? 0) + 1);
      if (q.transaction_case_id) hasCase.add(q.machine_id);
    }
    for (const c of (casesRes.data ?? []) as Array<{ machine_id?: string | null }>) {
      if (c.machine_id) hasCase.add(c.machine_id);
    }

    const out: StockAction[] = [];
    for (const m of (machinesRes.data ?? []) as Array<{
      id: string;
      brand?: string | null;
      model?: string | null;
      category?: string | null;
      status?: string | null;
      created_at?: string | null;
    }>) {
      const machine: MachineLite = {
        id: m.id,
        title: [m.brand, m.model].filter(Boolean).join(' ') || m.category || m.id,
        category: m.category ?? null,
      };
      const v = views.get(m.id) ?? { total: 0, recent: 0 };
      const createdMs = m.created_at ? Date.parse(m.created_at) : NaN;
      const sig: MachineSignals = {
        status: (m.status ?? 'available').trim().toLowerCase(),
        views: v.total,
        recentViews: v.recent,
        quotes: quotes.get(m.id) ?? 0,
        hasCase: hasCase.has(m.id),
        createdMs: Number.isFinite(createdMs) ? createdMs : null,
      };
      const action = deriveStockAction(machine, sig, nowMs);
      if (action) out.push(action);
    }
    return out.sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.machineId.localeCompare(b.machineId));
  } catch {
    return [];
  }
}
