/**
 * Traductions entre les données renvoyées par l'API métier et la forme
 * qu'attendent les widgets d'affichage.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Ces sept fonctions vivaient au milieu de `WidgetRenderer.tsx` (3 563 lignes).
 * Elles sont PURES — une entrée, une sortie, aucun état, aucun appel réseau —
 * et n'avaient pourtant aucun test, parce qu'on ne peut pas les atteindre sans
 * monter tout le tableau de bord et simuler une dizaine d'API.
 *
 * Sorties d'ici, elles se testent directement : voir `widgetRendererMappers.test.ts`.
 * Aucun comportement n'a été modifié pendant le déplacement.
 */

import type { getUpcomingRentals } from '../../utils/enterpriseApi/rentals';
import type { getRepairsStatus } from '../../utils/enterpriseApi/repairs';
import type { getInventoryStatus } from '../../utils/enterpriseApi/inventory';
import type { getTechniciansWorkload } from '../../utils/enterpriseApi/technicians';

export type RepairsRow = Awaited<ReturnType<typeof getRepairsStatus>>[number];
export type InventoryRow = Awaited<ReturnType<typeof getInventoryStatus>>[number];
export type WorkloadRow = Awaited<ReturnType<typeof getTechniciansWorkload>>[number];

/** Taille du texte selon la taille du widget et le type d'élément affiché. */
export function getFontSizeFromWidgetSize(size: string, type: 'title' | 'value' = 'title') {
  if (type === 'value') {
    if (size === '1/3') return 'text-[clamp(1rem,2vw,1.2rem)]';
    if (size === '1/2') return 'text-[clamp(1.1rem,2.5vw,1.5rem)]';
    if (size === '2/3') return 'text-[clamp(1.3rem,3vw,2rem)]';
    if (size === '1/1') return 'text-[clamp(1.5rem,4vw,2.5rem)]';
  } else {
    if (size === '1/3') return 'text-sm md:text-base';
    if (size === '1/2') return 'text-base md:text-lg';
    if (size === '2/3') return 'text-lg md:text-xl';
    if (size === '1/1') return 'text-xl md:text-2xl';
  }
  return 'text-base';
}

// ============================================================================
// MAPPERS LOUEUR
// ============================================================================

export function mapLoueurStatusForCalendar(
  status: string,
): 'confirmed' | 'pending' | 'in_progress' {
  const s = (status || '').toLowerCase();
  if (s.includes('cours')) return 'in_progress';
  if (s.includes('confirm') || s.includes('prête') || s.includes('prete')) return 'confirmed';
  return 'pending';
}

export function mapUpcomingRentalsForWidget(
  rows: Awaited<ReturnType<typeof getUpcomingRentals>>,
) {
  return rows.map((r) => ({
    id: String(r.id),
    equipment: r.equipmentFullName,
    client: r.clientName,
    clientPhone: undefined as string | undefined,
    location: '—',
    startDate: r.start_date ? String(r.start_date).split('T')[0] : '',
    endDate: r.end_date ? String(r.end_date).split('T')[0] : '',
    dailyRate: Number(r.pricePerDay) || 0,
    status: mapLoueurStatusForCalendar(String(r.status || '')),
    notes: undefined as string | undefined,
  }));
}

// ============================================================================
// MAPPERS MECANICIEN
// ============================================================================

export function mapRepairsForList(rows: RepairsRow[]) {
  return rows.map((r, idx) => {
    const statusLower = String(r.status || '').toLowerCase();
    const priority: 'high' | 'medium' | 'low' =
      statusLower.includes('urgent') || statusLower.includes('cours')
        ? 'high'
        : statusLower.includes('attente')
          ? 'medium'
          : 'low';
    return {
      id: r.id ?? `repair-${idx}`,
      title: `${r.equipment || 'Équipement'} — ${r.problem || 'Réparation'}`,
      description: `Tech: ${r.technician || 'Non assigné'} · ${r.estimated || ''} · ${
        typeof r.cost === 'number' ? `${r.cost.toLocaleString('fr-FR')} MAD` : ''
      }`.trim(),
      status: r.status || 'En attente',
      priority,
      timestamp: new Date().toISOString(),
    };
  });
}

export function mapInventoryForChart(rows: InventoryRow[]) {
  return rows.slice(0, 8).map((r) => ({
    name: r.category || r.title || 'Article',
    value: Number(r.stock) || 0,
    min: Number(r.minStock) || 0,
  }));
}

export function mapWorkloadForChart(rows: WorkloadRow[]) {
  return rows.map((r) => ({
    name: r.name || 'Technicien',
    value: Math.round(Number(r.workload_percentage) || 0),
  }));
}

export function mapEquipmentAvailabilityForWidget(details: any[]) {
  return details.map((m) => ({
    id: String(m.id),
    name: (m.equipmentFullName || m.name || 'Équipement') as string,
    status: (m.status === 'Disponible'
      ? 'available'
      : m.status === 'En location'
        ? 'rented'
        : 'maintenance') as 'available' | 'rented' | 'maintenance',
    location: 'Parc',
    lastUpdate: (m.updated_at as string) || new Date().toISOString(),
    returnDate: m.currentRental?.endDate
      ? String(m.currentRental.endDate).split('T')[0]
      : undefined,
    nextMaintenance: m.currentIntervention?.scheduledDate
      ? String(m.currentIntervention.scheduledDate).split('T')[0]
      : undefined,
  }));
}
