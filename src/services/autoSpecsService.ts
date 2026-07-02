// src/services/autoSpecsService.ts
import { toast } from '../utils/toast';
export interface NormalizedSpecs {
  brand?: string;
  model?: string;
  year_range?: string | null;
  dimensions?: {
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
  } | null;
  weight_kg?: number | null;
  engine?: {
    power_kw?: number | null;
    power_hp?: number | null;
    engine_model?: string | null;
  } | null;
  performance?: {
    bucket_capacity_m3?: number | null;
    max_dig_depth_mm?: number | null;
    max_reach_mm?: number | null;
  } | null;
  misc?: Record<string, any> | null;
  source_url?: string | null;
}

function tryParseJSON(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function cleanAndParse(raw: string): any {
  let cleaned = raw.trim().replace(/^=\s*/, '');
  if (cleaned.includes('"response":"=')) {
    cleaned = cleaned.replace('"response":"=', '"response":"');
  }
  cleaned = cleaned.replace(/\\n/g, ' ');
  // Si la totalité est un JSON, parse directement
  const parsed = tryParseJSON(cleaned);
  if (parsed) return parsed;
  // Sinon, tente de repérer un JSON embarqué dans response
  const m = cleaned.match(/\{[\s\S]*\}$/);
  if (m) {
    const inner = tryParseJSON(m[0]);
    if (inner) return inner;
  }
  return { response: cleaned };
}

function showDebugPayload(label: string, data: unknown): void {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('debugAutoSpecs') === 'true') {
      const text = JSON.stringify(data, null, 2);
      // Limiter la taille pour éviter les alertes trop longues
      toast(`${label}:\n` + (text.length > 2000 ? text.slice(0, 2000) + '\n…(tronqué)' : text));
    }
  } catch { /* ignore */ }
}

function buildDefaultContext(brand: string, model: string) {
  return {
    schema: 'minegrid.auto_specs.v1',
    includeMissing: true,
    brand,
    model,
    name: '',
    category: '',
    type: '',
    year: null,
    price: 0,
    condition: '',
    total_hours: 0,
    description: '',
    location: '',
    specifications: {
      weight: '',
      dimensions: { length: '', width: '', height: '' },
      power: { value: '', unit: 'kW' },
      operatingCapacity: { value: '', unit: 'kg' },
      workingWeight: ''
    }
  };
}

// Normalise un objet libre (venues de n8n) vers NormalizedSpecs
function normalizeToSpecs(input: any, fallbackBrand: string, fallbackModel: string): NormalizedSpecs {
  const brand = input?.brand ?? fallbackBrand;
  const model = input?.model ?? fallbackModel;

  const dimsFromMm = input?.dimensions_mm || {};
  const dimsStd = input?.dimensions || {};
  const dimensions = {
    length_mm: dimsFromMm.length ?? dimsStd.length_mm ?? null,
    width_mm: dimsFromMm.width ?? dimsStd.width_mm ?? null,
    height_mm: dimsFromMm.height ?? dimsStd.height_mm ?? null,
  } as NormalizedSpecs['dimensions'];

  const engine = {
    power_kw: input?.engine?.power_kw ?? input?.engine_power_kw ?? null,
    power_hp: input?.engine?.power_hp ?? input?.engine_power_hp ?? null,
    engine_model: input?.engine?.engine_model ?? input?.engine_model ?? null,
  } as NormalizedSpecs['engine'];

  const performance = {
    bucket_capacity_m3: input?.performance?.bucket_capacity_m3 ?? input?.bucket_capacity_m3 ?? null,
    max_dig_depth_mm: input?.performance?.max_dig_depth_mm ?? input?.max_dig_depth_mm ?? null,
    max_reach_mm: input?.performance?.max_reach_mm ?? input?.max_reach_mm ?? null,
  } as NormalizedSpecs['performance'];

  const weight_kg = input?.weight_kg ?? input?.operating_weight_kg ?? null;

  return {
    brand,
    model,
    year_range: input?.year_range ?? null,
    dimensions,
    weight_kg,
    engine,
    performance,
    misc: input?.misc ?? null,
    source_url: input?.source_url ?? null,
  };
}

export async function fetchModelSpecs(brand: string, model: string): Promise<NormalizedSpecs | null> {
  const url = import.meta.env.VITE_N8N_AUTO_SPECS_URL || '';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDefaultContext(brand, model))
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const raw = await res.text();
  let data = cleanAndParse(raw);

  // n8n peut renvoyer un tableau [{ response: {...} }]
  if (Array.isArray(data)) data = data[0];

  // Plusieurs formats possibles: {response: {...}} | {...}
  const normInput = typeof data?.response === 'string'
    ? tryParseJSON(data.response) ?? data
    : (data?.response ?? data);

  // On s’assure d’un objet
  if (!normInput || typeof normInput !== 'object') return null;

  const normalized: NormalizedSpecs = {
    brand: normInput.brand ?? brand,
    model: normInput.model ?? model,
    year_range: normInput.year_range ?? null,
    dimensions: normInput.dimensions ?? null,
    weight_kg: normInput.weight_kg ?? normInput.weight ?? null,
    engine: normInput.engine ?? null,
    performance: normInput.performance ?? null,
    misc: normInput.misc ?? null,
    source_url: normInput.source_url ?? null,
  };

  return normalized;
}

export async function fetchModelSpecsFull(
  brand: string,
  model: string,
  context?: Record<string, any>
): Promise<{ specs: NormalizedSpecs | null; missing?: string[]; suggestions?: Record<string, any> }>{
  const url = import.meta.env.VITE_N8N_AUTO_SPECS_URL || '';
  const payload = { schema: 'minegrid.auto_specs.v1', includeMissing: true, brand, model, ...(context || {}) } as Record<string, any>;
  try { console.log('🧪 AutoSpecs payload →', payload); } catch { /* ignore */ }
  showDebugPayload('Payload AutoSpecs envoyé', payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const raw = await res.text();
  let data = cleanAndParse(raw);
  if (Array.isArray(data)) data = data[0];

  // Cas idéal: n8n renvoie { specs, missing?, suggestions? }
  if (data?.specs) {
    const specs = normalizeToSpecs(data.specs, brand, model);
    return {
      specs,
      missing: Array.isArray(data.missing) ? data.missing as string[] : undefined,
      suggestions: typeof data.suggestions === 'object' ? data.suggestions as Record<string, any> : undefined,
    };
  }

  // Fallback: n8n renvoie du texte/objet brut, éventuellement sous response/ResponseRaw
  const rawCandidate = (typeof data?.response === 'string') ? tryParseJSON(data.response) : (data?.response ?? data);
  const specs = normalizeToSpecs(rawCandidate, brand, model);
  return { specs };
}

export function toSellEquipmentForm(specs: NormalizedSpecs) {
  const powerKw = specs.engine?.power_kw ?? null;
  const powerHp = specs.engine?.power_hp ?? (powerKw ? Math.round(powerKw * 1.341) : null);
  
  // Générer une description basée sur les spécifications
  const descriptionParts = [];
  if (specs.brand && specs.model) {
    descriptionParts.push(`${specs.brand.toUpperCase()} ${specs.model.toUpperCase()}`);
  }
  if (specs.year_range) {
    descriptionParts.push(`Année: ${specs.year_range}`);
  }
  if (specs.dimensions?.length_mm && specs.dimensions?.width_mm && specs.dimensions?.height_mm) {
    descriptionParts.push(`Dimensions: ${specs.dimensions.length_mm} x ${specs.dimensions.width_mm} x ${specs.dimensions.height_mm} mm`);
  }
  if (specs.weight_kg) {
    descriptionParts.push(`Poids: ${specs.weight_kg} kg`);
  }
  if (powerKw || powerHp) {
    const powerStr = powerKw ? `${powerKw} kW` : `${powerHp} HP`;
    descriptionParts.push(`Puissance: ${powerStr}`);
  }
  if (specs.engine?.engine_model) {
    descriptionParts.push(`Moteur: ${specs.engine.engine_model}`);
  }
  if (specs.performance?.bucket_capacity_m3) {
    descriptionParts.push(`Capacité godet: ${specs.performance.bucket_capacity_m3} m³`);
  }
  
  const description = descriptionParts.length > 0 
    ? descriptionParts.join(' | ') 
    : `${specs.brand || 'Équipement'} ${specs.model || ''} - Spécifications techniques disponibles`;
  
  return {
    description,
    specifications: {
      weight: specs.weight_kg ? String(specs.weight_kg) : '',
      dimensions: {
        length: specs.dimensions?.length_mm ? String(specs.dimensions.length_mm) : '',
        width: specs.dimensions?.width_mm ? String(specs.dimensions.width_mm) : '',
        height: specs.dimensions?.height_mm ? String(specs.dimensions.height_mm) : ''
      },
      power: {
        value: powerKw ? String(powerKw) : powerHp ? String(powerHp) : '',
        unit: powerKw ? 'kW' : 'HP'
      },
      workingWeight: specs.weight_kg ? String(specs.weight_kg) : ''
    }
  };
}

export function toPublicationRapideForm(specs: NormalizedSpecs) {
  const powerKw = specs.engine?.power_kw ?? null;
  const powerHp = specs.engine?.power_hp ?? (powerKw ? Math.round(powerKw * 1.341) : null);
  const dims = specs.dimensions;
  const dimsStr = dims
    ? [dims.length_mm && `${dims.length_mm} mm`, dims.width_mm && `${dims.width_mm} mm`, dims.height_mm && `${dims.height_mm} mm`]
        .filter(Boolean)
        .join(' x ')
    : '';
  
  // Générer une description basée sur les spécifications
  const descriptionParts = [];
  if (specs.brand && specs.model) {
    descriptionParts.push(`${specs.brand.toUpperCase()} ${specs.model.toUpperCase()}`);
  }
  if (specs.year_range) {
    descriptionParts.push(`Année: ${specs.year_range}`);
  }
  if (dimsStr) {
    descriptionParts.push(`Dimensions: ${dimsStr}`);
  }
  if (specs.weight_kg) {
    descriptionParts.push(`Poids: ${specs.weight_kg} kg`);
  }
  if (powerKw || powerHp) {
    const powerStr = powerKw ? `${powerKw} kW` : `${powerHp} HP`;
    descriptionParts.push(`Puissance: ${powerStr}`);
  }
  if (specs.engine?.engine_model) {
    descriptionParts.push(`Moteur: ${specs.engine.engine_model}`);
  }
  if (specs.performance?.bucket_capacity_m3) {
    descriptionParts.push(`Capacité godet: ${specs.performance.bucket_capacity_m3} m³`);
  }
  
  const description = descriptionParts.length > 0 
    ? descriptionParts.join(' | ') 
    : `${specs.brand || 'Équipement'} ${specs.model || ''} - Spécifications techniques disponibles`;
  
  return {
    description,
    specifications: {
      weight: specs.weight_kg ?? 0,
      power: { value: powerKw ?? powerHp ?? 0, unit: powerKw ? 'kW' : 'HP' },
      dimensions: dimsStr,
      workingWeight: specs.weight_kg ?? 0,
      operatingCapacity: 0
    }
  };
}

export function summarizeSpecs(specs: NormalizedSpecs): string {
  const parts: string[] = [];
  const d = specs.dimensions;
  if (d && (d.length_mm || d.width_mm || d.height_mm)) {
    parts.push(`Dimensions: ${d.length_mm ?? '-'} x ${d.width_mm ?? '-'} x ${d.height_mm ?? '-'} mm`);
  }
  if (typeof specs.weight_kg === 'number') parts.push(`Poids: ${specs.weight_kg} kg`);
  const pkw = specs.engine?.power_kw; const php = specs.engine?.power_hp;
  if (pkw || php) parts.push(`Puissance: ${pkw ?? ''}${pkw ? ' kW' : ''}${pkw && php ? ' / ' : ''}${php ?? ''}${php ? ' HP' : ''}`);
  if (specs.engine?.engine_model) parts.push(`Moteur: ${specs.engine.engine_model}`);
  const perf = specs.performance;
  if (perf?.bucket_capacity_m3) parts.push(`Godet: ${perf.bucket_capacity_m3} m³`);
  if (perf?.max_dig_depth_mm) parts.push(`Prof. fouille: ${perf.max_dig_depth_mm} mm`);
  if (perf?.max_reach_mm) parts.push(`Portée max: ${perf.max_reach_mm} mm`);
  return parts.join(' | ');
}

export function missingForSell(specs: NormalizedSpecs): string[] {
  const missing: string[] = [];
  if (!specs.dimensions?.length_mm) missing.push('Longueur (mm)');
  if (!specs.dimensions?.width_mm) missing.push('Largeur (mm)');
  if (!specs.dimensions?.height_mm) missing.push('Hauteur (mm)');
  if (typeof specs.weight_kg !== 'number') missing.push('Poids (kg)');
  if (!specs.engine?.power_kw && !specs.engine?.power_hp) missing.push('Puissance (kW/HP)');
  return missing;
}

export function missingForPublication(specs: NormalizedSpecs): string[] {
  const missing: string[] = [];
  if (!specs.dimensions?.length_mm || !specs.dimensions?.width_mm || !specs.dimensions?.height_mm) missing.push('Dimensions (L x l x H)');
  if (typeof specs.weight_kg !== 'number') missing.push('Poids');
  if (!specs.engine?.power_kw && !specs.engine?.power_hp) missing.push('Puissance');
  return missing;
} 