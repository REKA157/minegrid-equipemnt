/**
 * Insight d'annonce RÉEL : machines très vues mais SANS devis -> à optimiser.
 * Sources réelles : machines (du vendeur) × machine_views × quote_requests.
 * Anti-façade : aucune valeur inventée ; [] si pas de donnée ou en cas d'échec.
 */
import supabase from '../supabaseClient';
import { getCurrentSellerUserId, getMachineIdsForSellerUser } from '../enterpriseApi/sellerScope';

export interface ListingViewGap {
  machineId: string;
  title: string;
  views: number;
}

const MIN_VIEWS = 10; // seuil « beaucoup de vues » avant de signaler l'absence de devis

export async function loadListingViewGaps(): Promise<ListingViewGap[]> {
  try {
    const uid = await getCurrentSellerUserId();
    if (!uid) return [];
    const machineIds = await getMachineIdsForSellerUser(uid);
    if (!machineIds.length) return [];

    const [machinesRes, viewsRes, quotesRes] = await Promise.all([
      supabase.from('machines').select('id, brand, model').in('id', machineIds),
      supabase.from('machine_views').select('machine_id').in('machine_id', machineIds),
      supabase.from('quote_requests').select('machine_id').in('machine_id', machineIds),
    ]);

    const titles = new Map<string, string>();
    for (const m of (machinesRes.data ?? []) as Array<{ id: string; brand?: string; model?: string }>) {
      titles.set(m.id, [m.brand, m.model].filter(Boolean).join(' ') || m.id);
    }
    const viewCount = new Map<string, number>();
    for (const v of (viewsRes.data ?? []) as Array<{ machine_id?: string }>) {
      if (v.machine_id) viewCount.set(v.machine_id, (viewCount.get(v.machine_id) ?? 0) + 1);
    }
    const quoted = new Set<string>();
    for (const q of (quotesRes.data ?? []) as Array<{ machine_id?: string }>) {
      if (q.machine_id) quoted.add(q.machine_id);
    }

    const gaps: ListingViewGap[] = [];
    viewCount.forEach((views, machineId) => {
      if (views >= MIN_VIEWS && !quoted.has(machineId)) {
        gaps.push({ machineId, title: titles.get(machineId) ?? machineId, views });
      }
    });
    return gaps.sort((a, b) => b.views - a.views || a.machineId.localeCompare(b.machineId));
  } catch {
    return [];
  }
}
