import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';
import type { ListItem } from '../../constants/dashboardTypes';

export type LogisticsRouteRow = {
  id: string;
  route_ref: string;
  vehicle_label?: string | null;
  status: string;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_lat: number | null;
  dest_lng: number | null;
  current_lat: number | null;
  current_lng: number | null;
  origin_label?: string | null;
  dest_label?: string | null;
  cargo_summary?: string | null;
  eta?: string | null;
};

const ROUTE_COL = `
  id, route_ref, vehicle_label, status, origin_lat, origin_lng, dest_lat, dest_lng,
  current_lat, current_lng, origin_label, dest_label, cargo_summary, eta, updated_at
`;

const KPI_COL = `id, period_month, on_time_pct, fill_rate_pct, avg_lead_time_days, incidents, created_at`;

const ALERT_COL = `
  id, sku_label, warehouse_name, alert_type, current_qty, target_qty, priority, status, notes, created_at
`;

/** Taux d'occupation pondéré + alertes entrepôts */
export async function getWarehouseOccupancyMetrics() {
  const rows = await supabaseCall<
    Array<{
      name: string;
      city: string | null;
      capacity_pallets: number;
      used_pallets: number;
      status: string;
    }>
  >(
    () =>
      supabase
        .from('logistics_warehouses')
        .select('name, city, capacity_pallets, used_pallets, status'),
    { label: 'getWarehouseOccupancyMetrics', fallback: [] },
  );

  let capSum = 0;
  let usedSum = 0;
  for (const r of rows) {
    capSum += Number(r.capacity_pallets || 0);
    usedSum += Number(r.used_pallets || 0);
  }
  const weightedOccupancyPct = capSum > 0 ? Math.round((usedSum / capSum) * 1000) / 10 : 0;

  const critical = rows.filter(
    (r) =>
      r.status === 'Surchargé' ||
      (Number(r.capacity_pallets) > 0 &&
        Number(r.used_pallets) / Number(r.capacity_pallets) >= 0.92),
  ).length;

  const maintenance = rows.filter((r) => r.status === 'Maintenance' || r.status === 'Fermé').length;

  return {
    warehouseCount: rows.length,
    weightedOccupancyPct,
    criticalWarehouses: critical,
    maintenanceWarehouses: maintenance,
    totalCapacityPallets: capSum,
    totalUsedPallets: usedSum,
  };
}

export async function getRouteTrackingRows(): Promise<LogisticsRouteRow[]> {
  const rows = await supabaseCall<Array<Record<string, unknown>>>(
    () =>
      supabase
        .from('logistics_route_tracking')
        .select(ROUTE_COL)
        .neq('status', 'Annulé')
        .order('updated_at', { ascending: false })
        .limit(30),
    { label: 'getRouteTrackingRows', fallback: [] },
  );

  return rows.map((r) => ({
    id: String(r.id),
    route_ref: String(r.route_ref || ''),
    vehicle_label: r.vehicle_label as string | null,
    status: String(r.status || ''),
    origin_lat: r.origin_lat != null ? Number(r.origin_lat) : null,
    origin_lng: r.origin_lng != null ? Number(r.origin_lng) : null,
    dest_lat: r.dest_lat != null ? Number(r.dest_lat) : null,
    dest_lng: r.dest_lng != null ? Number(r.dest_lng) : null,
    current_lat: r.current_lat != null ? Number(r.current_lat) : null,
    current_lng: r.current_lng != null ? Number(r.current_lng) : null,
    origin_label: r.origin_label as string | null,
    dest_label: r.dest_label as string | null,
    cargo_summary: r.cargo_summary as string | null,
    eta: r.eta as string | null,
  }));
}

/** KPIs mensuels — graphique sur % livraisons à temps */
export async function getSupplyChainKpisChart() {
  const rows = await supabaseCall<
    Array<{
      period_month: string;
      on_time_pct: number | null;
      fill_rate_pct: number | null;
      avg_lead_time_days: number | null;
      incidents: number | null;
    }>
  >(
    () => supabase.from('logistics_scm_kpis_monthly').select(KPI_COL).order('period_month', { ascending: true }),
    { label: 'getSupplyChainKpisChart', fallback: [] },
  );

  const sorted = [...rows].sort((a, b) => String(a.period_month).localeCompare(String(b.period_month)));
  const last6 = sorted.slice(-6);

  const chartData = last6.map((r) => {
    const d = new Date(r.period_month);
    return {
      name: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      value: Math.round(Number(r.on_time_pct || 0) * 10) / 10,
      fillRate: Math.round(Number(r.fill_rate_pct || 0) * 10) / 10,
      leadTime: Math.round(Number(r.avg_lead_time_days || 0) * 10) / 10,
      incidents: Number(r.incidents || 0),
    };
  });

  const last = last6.length ? last6[last6.length - 1] : null;
  const prev = last6.length > 1 ? last6[last6.length - 2] : null;
  let onTimeDelta = 0;
  if (last && prev) {
    onTimeDelta =
      Math.round((Number(last.on_time_pct || 0) - Number(prev.on_time_pct || 0)) * 10) / 10;
  }

  return {
    chartData,
    latestOnTime: last ? Math.round(Number(last.on_time_pct || 0) * 10) / 10 : 0,
    latestFillRate: last ? Math.round(Number(last.fill_rate_pct || 0) * 10) / 10 : 0,
    latestLeadDays: last ? Math.round(Number(last.avg_lead_time_days || 0) * 10) / 10 : 0,
    latestIncidents: last ? Number(last.incidents || 0) : 0,
    onTimeDelta,
  };
}

function alertPriority(p: string): 'high' | 'medium' | 'low' {
  if (p === 'Urgent') return 'high';
  if (p === 'Normal') return 'medium';
  return 'low';
}

export async function getLogisticsStockAlertsList(): Promise<ListItem[]> {
  const rows = await supabaseCall<Array<Record<string, unknown>>>(
    () =>
      supabase
        .from('logistics_stock_alerts')
        .select(ALERT_COL)
        .in('status', ['Ouvert', 'En traitement'])
        .order('created_at', { ascending: false })
        .limit(25),
    { label: 'getLogisticsStockAlertsList', fallback: [] },
  );

  return rows.map((r) => ({
    id: String(r.id),
    title: `${r.sku_label}${r.warehouse_name ? ` · ${r.warehouse_name}` : ''}`,
    description: `${r.alert_type} — stock ${r.current_qty ?? '—'} / cible ${r.target_qty ?? '—'}`,
    status: String(r.status || ''),
    priority: alertPriority(String(r.priority || 'Normal')),
    timestamp: r.created_at ? String(r.created_at) : undefined,
  }));
}
