import { fetchProjectDetail } from '../services/monitorApi';
import { monitorNeedsToContext, type MonitorLeadContext } from './globalMonitorEquipmentNeedsText';

/**
 * Pour chaque `source_id` (id projet monitor), récupère le détail sans forcer le LLM
 * et extrait le contexte besoins matériel pour le rapprochement stock.
 */
export async function buildMonitorContextBySourceIds(
  sourceIds: string[],
): Promise<Map<string, MonitorLeadContext>> {
  const map = new Map<string, MonitorLeadContext>();
  const unique = [...new Set(sourceIds.map((s) => s.trim()).filter(Boolean))].slice(0, 14);
  if (!unique.length) return map;

  const settled = await Promise.allSettled(
    unique.map((id) => fetchProjectDetail(id, false)),
  );

  unique.forEach((id, i) => {
    const r = settled[i];
    if (r.status !== 'fulfilled') return;
    const ctx = monitorNeedsToContext(r.value.equipment_needs || []);
    if (ctx) map.set(id, ctx);
  });

  return map;
}
