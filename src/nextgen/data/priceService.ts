import supabase from '../../utils/supabaseClient';
import { estimatePrice, type PriceEstimate, type PriceObservation } from './estimatePrice';

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
  // 1) RPC serveur `estimate_price` (si déployée sur price_observations).
  try {
    const { data, error } = await supabase.rpc('estimate_price', q);
    if (!error && data) {
      const d = data as { estimate?: number; low?: number; high?: number; n?: number };
      if (typeof d.estimate === 'number') {
        return { estimate: d.estimate, low: d.low ?? null, high: d.high ?? null, n: d.n ?? 0, method: 'median_iqr' };
      }
    }
  } catch {
    // RPC absente/erreur → on tente le fallback client ci-dessous.
  }

  // 2) Fallback CLIENT (en attendant la RPC) : médiane+IQR sur les annonces
  //    comparables RÉELLES déjà publiées dans `machines` (même marque, et même
  //    modèle si l'échantillon le permet). Anti-façade : estimatePrice renvoie
  //    `insufficient_data` sous MIN_OBSERVATIONS → l'UI reste alors invisible.
  return estimateMachinePriceFromListings(q);
}

/** Estimation de repli (client) à partir des annonces publiques `machines` comparables. */
async function estimateMachinePriceFromListings(q: PriceQuery): Promise<PriceEstimate> {
  const brand = (q.brand || '').trim();
  if (!brand) return UNAVAILABLE;
  try {
    const { data, error } = await supabase
      .from('machines')
      .select('price, model, year')
      .ilike('brand', brand)
      .limit(300);
    if (error || !data) return UNAVAILABLE;
    const rows = data as { price: number | null; model: string | null; year: number | null }[];
    const toObs = (list: typeof rows): PriceObservation[] =>
      list
        .map((r) => ({
          price: typeof r.price === 'number' ? r.price : Number(r.price),
          year: r.year ?? null,
        }))
        .filter((o) => Number.isFinite(o.price) && o.price > 0);

    const model = (q.model || '').trim().toLowerCase();
    let chosen = toObs(rows);
    if (model) {
      const modelRows = toObs(rows.filter((r) => (r.model || '').trim().toLowerCase() === model));
      if (modelRows.length >= 3) chosen = modelRows; // estimation au modèle si assez d'échantillon
    }
    return estimatePrice(chosen);
  } catch {
    return UNAVAILABLE;
  }
}
