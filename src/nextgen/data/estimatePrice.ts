// MineGrid Data — estimation de prix à partir d'observations propriétaires.
// MVP statistique robuste (médiane + IQR), pure et testable. En production, exposée
// via une RPC serveur `estimate_price(...)` sur price_observations (jamais de dump brut).
//
// ANTI-FAÇADE : en dessous d'un minimum d'observations, on ne fabrique PAS un prix —
// on renvoie `insufficient_data` (l'UI affichera « Donnée indisponible »).

export interface PriceObservation {
  price: number;
  year?: number | null;
  hours?: number | null;
}

export interface PriceEstimate {
  estimate: number | null;
  low: number | null;
  high: number | null;
  n: number;
  method: 'median_iqr' | 'insufficient_data';
}

export const MIN_OBSERVATIONS = 3;

export function estimatePrice(observations: PriceObservation[]): PriceEstimate {
  const prices = observations
    .map((o) => o.price)
    .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (prices.length < MIN_OBSERVATIONS) {
    return { estimate: null, low: null, high: null, n: prices.length, method: 'insufficient_data' };
  }

  const estimate = quantile(prices, 0.5);
  const low = quantile(prices, 0.25);
  const high = quantile(prices, 0.75);

  return {
    estimate: round(estimate),
    low: round(low),
    high: round(high),
    n: prices.length,
    method: 'median_iqr',
  };
}

// Quantile par interpolation linéaire (sur tableau déjà trié croissant).
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function round(n: number): number {
  return Math.round(n);
}
