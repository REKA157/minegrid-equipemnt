// MineGrid Logistics — estimation indicative de devis transport (MVP, pure).
// Grille tarifaire d'apport (marge sur transporteurs partenaires). En prod : devis
// réels via API transporteurs. ANTI-FAÇADE : paramètres manquants => null + 'unavailable'.

export type TransportMode = 'road' | 'sea' | 'rail' | 'multimodal';

export interface LogisticsInput {
  mode: TransportMode;
  weightKg: number;
  distanceKm?: number | null; // requis pour road/rail
}

export interface LogisticsQuote {
  price: number | null;
  currency: 'EUR';
  etaDays: number | null;
  method: 'tariff_grid' | 'unavailable';
}

// Tarifs indicatifs (EUR) — base + €/tonne, et €/tonne/km pour les modes terrestres.
const BASE: Record<TransportMode, number> = { road: 300, sea: 800, rail: 500, multimodal: 900 };
const PER_TONNE: Record<TransportMode, number> = { road: 0, sea: 90, rail: 0, multimodal: 110 };
const PER_TONNE_KM: Record<TransportMode, number> = { road: 0.12, sea: 0, rail: 0.06, multimodal: 0 };
const SPEED_KM_PER_DAY: Record<TransportMode, number> = { road: 500, sea: 0, rail: 400, multimodal: 0 };
const FIXED_ETA: Partial<Record<TransportMode, number>> = { sea: 21, multimodal: 28 };

export function quoteEstimate(input: LogisticsInput): LogisticsQuote {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return { price: null, currency: 'EUR', etaDays: null, method: 'unavailable' };
  }
  const tonnes = input.weightKg / 1000;
  const terrestrial = input.mode === 'road' || input.mode === 'rail';

  if (terrestrial && (input.distanceKm == null || input.distanceKm <= 0)) {
    return { price: null, currency: 'EUR', etaDays: null, method: 'unavailable' };
  }

  const price =
    BASE[input.mode] +
    PER_TONNE[input.mode] * tonnes +
    PER_TONNE_KM[input.mode] * tonnes * (input.distanceKm ?? 0);

  let etaDays: number | null = FIXED_ETA[input.mode] ?? null;
  if (terrestrial && input.distanceKm) {
    etaDays = Math.max(1, Math.ceil(input.distanceKm / SPEED_KM_PER_DAY[input.mode]));
  }

  return { price: Math.round(price), currency: 'EUR', etaDays, method: 'tariff_grid' };
}
