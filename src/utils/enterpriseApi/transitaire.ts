import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import type { ListItem } from '../../constants/dashboardTypes';

// =====================================================
// APIs DASHBOARD TRANSITAIRE
// =====================================================

export type FreightContainerRow = {
  id: string;
  container_number: string;
  status: string;
  lat: number | null;
  lng: number | null;
  vessel_name?: string | null;
  voyage_ref?: string | null;
  last_port?: string | null;
  next_port?: string | null;
  eta?: string | null;
};

const FMV_COL = `id, period_month, direction, teu_count, value_mad, created_at`;

const FD_COL = `
  id, title, doc_type, status, priority, due_date, linked_container_number, linked_declaration_ref, notes, created_at
`;

function isOpenDeclaration(status: string): boolean {
  return !['Liquidée', 'Annulée'].includes(status);
}

/** Widget metric : déclarations en cours / bloquées / retards */
export async function getCustomsClearanceMetrics() {
  const rows = await supabaseCall<
    Array<{ status: string; declared_value_mad: number | null; expected_clearance_date: string | null }>
  >(
    () => supabase.from('customs_declarations').select('status, declared_value_mad, expected_clearance_date'),
    { label: 'getCustomsClearanceMetrics', fallback: [] },
  );

  const open = rows.filter((r) => isOpenDeclaration(r.status));
  const inProgress = open.filter((r) =>
    ['En préparation', 'Soumise', 'En contrôle douanier'].includes(r.status),
  ).length;
  const blocked = open.filter((r) => r.status === 'Bloquée').length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delayed = open.filter((r) => {
    if (!r.expected_clearance_date) return false;
    const d = new Date(r.expected_clearance_date);
    d.setHours(0, 0, 0, 0);
    return d < today && r.status !== 'Bloquée';
  }).length;

  const totalValueOpen = open.reduce((s, r) => s + Number(r.declared_value_mad || 0), 0);
  const totalDeclarations = rows.length;

  return {
    openCount: open.length,
    inProgress,
    blocked,
    delayed,
    totalValueOpen: Math.round(totalValueOpen),
    totalDeclarations,
    liquidated: rows.filter((r) => r.status === 'Liquidée').length,
  };
}

const FC_COL = `
  id, container_number, status, lat, lng, vessel_name, voyage_ref, last_port, next_port, eta, notes, created_at
`;

/** Positions conteneurs pour la carte */
export async function getContainerTrackingRows(): Promise<FreightContainerRow[]> {
  const rows = await supabaseCall<Array<Record<string, unknown>>>(
    () =>
      supabase
        .from('freight_containers')
        .select(FC_COL)
        .order('updated_at', { ascending: false })
        .limit(40),
    { label: 'getContainerTrackingRows', fallback: [] },
  );

  return rows.map((r) => ({
    id: String(r.id),
    container_number: String(r.container_number || ''),
    status: String(r.status || ''),
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    vessel_name: r.vessel_name as string | null,
    voyage_ref: r.voyage_ref as string | null,
    last_port: r.last_port as string | null,
    next_port: r.next_port as string | null,
    eta: r.eta as string | null,
  }));
}

/**
 * Surestaries / détention : conteneurs au-delà de la période de franchise au port.
 * Coût = jours de dépassement × tarif/jour. Exposition = somme des coûts en cours.
 * Enjeu financier n°1 du transitaire sur le marché Maroc/Afrique de l'Ouest.
 */
export type DemurrageItem = {
  id: string;
  container_number: string;
  status: string;
  port: string | null;
  daysOver: number;
  cost: number;
  ratePerDay: number;
  freeUntil: string | null;
  returned: boolean;
};

export async function getDemurrageExposure() {
  const rows = await supabaseCall<Array<Record<string, unknown>>>(
    () =>
      supabase
        .from('freight_containers')
        .select(
          'id, container_number, status, next_port, last_port, arrival_date, free_days, demurrage_rate_per_day, returned_date',
        )
        .order('arrival_date', { ascending: true, nullsFirst: false }),
    { label: 'getDemurrageExposure', fallback: [] },
  );

  const DAY = 1000 * 3600 * 24;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items: DemurrageItem[] = rows
    .map((r) => {
      const arrival = r.arrival_date ? new Date(String(r.arrival_date)) : null;
      if (!arrival) return null;
      const freeDays = Number(r.free_days ?? 0);
      const rate = Number(r.demurrage_rate_per_day ?? 0);
      const returned = r.returned_date ? new Date(String(r.returned_date)) : null;
      const freeUntil = new Date(arrival.getTime() + freeDays * DAY);
      const endRef = returned ?? today;
      const daysOver = Math.max(0, Math.floor((endRef.getTime() - freeUntil.getTime()) / DAY));
      return {
        id: String(r.id),
        container_number: String(r.container_number || ''),
        status: String(r.status || ''),
        port: (r.next_port as string) || (r.last_port as string) || null,
        daysOver,
        cost: Math.round(daysOver * rate),
        ratePerDay: rate,
        freeUntil: freeUntil.toISOString().slice(0, 10),
        returned: !!returned,
      };
    })
    .filter((x): x is DemurrageItem => !!x);

  const inDemurrage = items.filter((i) => i.daysOver > 0 && !i.returned);
  return {
    items: items.sort((a, b) => b.cost - a.cost),
    inDemurrageCount: inDemurrage.length,
    totalCost: inDemurrage.reduce((s, i) => s + i.cost, 0),
    maxDaysOver: inDemurrage.reduce((m, i) => Math.max(m, i.daysOver), 0),
    watchCount: items.filter((i) => i.daysOver === 0 && !i.returned).length,
  };
}

/** Séries mensuelles TEU Import / Export + données graphique */
export async function getImportExportStats() {
  const rows = await supabaseCall<Array<{ period_month: string; direction: string; teu_count: number; value_mad: number }>>(
    () => supabase.from('freight_monthly_volumes').select(FMV_COL).order('period_month', { ascending: true }),
    { label: 'getImportExportStats.rows', fallback: [] },
  );

  const byMonth = new Map<
    string,
    { importTeu: number; exportTeu: number; importVal: number; exportVal: number }
  >();

  for (const r of rows) {
    const key = String(r.period_month).slice(0, 10);
    if (!byMonth.has(key)) {
      byMonth.set(key, { importTeu: 0, exportTeu: 0, importVal: 0, exportVal: 0 });
    }
    const b = byMonth.get(key)!;
    const teu = Number(r.teu_count || 0);
    const val = Number(r.value_mad || 0);
    if (r.direction === 'Import') {
      b.importTeu += teu;
      b.importVal += val;
    } else {
      b.exportTeu += teu;
      b.exportVal += val;
    }
  }

  const sortedKeys = [...byMonth.keys()].sort();
  const last6 = sortedKeys.slice(-6);

  const chartData = last6.map((k) => {
    const b = byMonth.get(k)!;
    const d = new Date(k);
    const name = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    return {
      name,
      value: Math.round((b.importTeu + b.exportTeu) * 10) / 10,
      importTeu: Math.round(b.importTeu * 10) / 10,
      exportTeu: Math.round(b.exportTeu * 10) / 10,
    };
  });

  const last = last6.length ? byMonth.get(last6[last6.length - 1]!)! : null;
  const prev = last6.length > 1 ? byMonth.get(last6[last6.length - 2]!)! : null;
  let teuGrowth = 0;
  if (last && prev) {
    const tLast = last.importTeu + last.exportTeu;
    const tPrev = prev.importTeu + prev.exportTeu;
    if (tPrev > 0) teuGrowth = parseFloat((((tLast - tPrev) / tPrev) * 100).toFixed(1));
    else if (tLast > 0) teuGrowth = 100;
  }

  return {
    chartData,
    latestImportTeu: last ? Math.round(last.importTeu * 10) / 10 : 0,
    latestExportTeu: last ? Math.round(last.exportTeu * 10) / 10 : 0,
    teuGrowth,
  };
}

function docPriorityToList(p: string): 'high' | 'medium' | 'low' {
  if (p === 'Urgent') return 'high';
  if (p === 'Normal') return 'medium';
  return 'low';
}

/** Documents fret → format liste dashboard */
export async function getFreightDocumentsForList(): Promise<ListItem[]> {
  const rows = await supabaseCall<Array<Record<string, unknown>>>(
    () =>
      supabase
        .from('freight_documents')
        .select(FD_COL)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(25),
    { label: 'getFreightDocumentsForList', fallback: [] },
  );

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title || ''),
    description: [r.doc_type, r.linked_container_number, r.linked_declaration_ref].filter(Boolean).join(' · ') || undefined,
    status: String(r.status || ''),
    priority: docPriorityToList(String(r.priority || 'Normal')),
    timestamp: r.due_date ? String(r.due_date) : undefined,
  }));
}
