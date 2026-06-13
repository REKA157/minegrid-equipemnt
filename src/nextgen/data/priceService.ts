import supabase from '../../utils/supabaseClient';
import type { PriceEstimate } from './estimatePrice';

export interface PriceQuery {
  machine_type?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  country?: string | null;
}

const UNAVAILABLE: PriceEstimate = { estimate: null, low: null, high: null, n: 0, method: 'insufficient_data' };

// Estimation de prix via la RPC serveur `estimate_price` (la table price_observations
// est en deny-par-défaut côté client — cf. RLS 0003). Tant que la RPC n'est pas
// déployée, on renvoie HONNÊTEMENT « insufficient_data » → l'UI affiche
// « Donnée indisponible ». Aucune valeur inventée.
export async function estimateMachinePrice(q: PriceQuery): Promise<PriceEstimate> {
  try {
    const { data, error } = await supabase.rpc('estimate_price', q);
    if (error || !data) return UNAVAILABLE;
    const d = data as { estimate?: number; low?: number; high?: number; n?: number };
    if (typeof d.estimate !== 'number') return { ...UNAVAILABLE, n: d.n ?? 0 };
    return { estimate: d.estimate, low: d.low ?? null, high: d.high ?? null, n: d.n ?? 0, method: 'median_iqr' };
  } catch {
    return UNAVAILABLE;
  }
}
