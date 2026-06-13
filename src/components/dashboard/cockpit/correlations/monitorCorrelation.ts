import type { RealLead } from '../../../../services/realPipelineService';
import type { CockpitSignal } from '../buildVendeurCockpit';

function isOpen(stage: string): boolean {
  const s = (stage || '').trim();
  return s !== 'Conclu' && s !== 'Perdu';
}

/**
 * CORRÉLATION M8/M9 — Global Monitor → opportunité → vendeur concerné.
 *
 * Croise les leads du pipeline avec les projets détectés par le Global Monitor
 * (besoins matériel) : un lead est rattaché à un projet quand son `source_id`
 * figure dans le contexte monitor (`buildMonitorContextBySourceIds`, service réel).
 * Cross-module Monitor + Leads (+ stock côté StockStatusWidget du dashboard).
 *
 * Anti-façade : aucune carte si le monitor est indisponible (map vide) ou si aucun
 * lead ouvert n'est rattaché à un projet. Aucune donnée inventée.
 */
export function buildMonitorSignals(
  leads: RealLead[],
  monitorBySourceId: Map<string, unknown>,
): { opportunities: CockpitSignal[] } {
  if (!monitorBySourceId || monitorBySourceId.size === 0) return { opportunities: [] };
  const matched = leads.filter(
    (l) => isOpen(l.stage || '') && l.source_id && monitorBySourceId.has(String(l.source_id).trim()),
  );
  if (!matched.length) return { opportunities: [] };
  return {
    opportunities: [
      {
        id: 'corr:monitor-projects',
        label: `${matched.length} prospect(s) avec besoin projet détecté (Global Monitor)`,
        detail: 'Rapprocher du stock et proposer un devis ciblé',
        href: '#dashboard-entreprise',
        tone: 'good',
      },
    ],
  };
}
