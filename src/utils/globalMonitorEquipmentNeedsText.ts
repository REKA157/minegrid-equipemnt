import type { EquipmentNeed } from '../types/monitor';

export type MonitorLeadContext = {
  /** Texte riche en mots-clés pour rapprocher le stock */
  scoringText: string;
  /** Libellé court pour l’UI (widget pipeline / stock) */
  displayShort: string;
};

/**
 * Mots-clés pour scoring (libellés catalogue + catégories monitor).
 */
export function equipmentNeedsToScoringText(needs: EquipmentNeed[]): string {
  if (!needs?.length) return '';
  const parts: string[] = [];
  for (const n of needs.slice(0, 12)) {
    const label =
      n.marketplace_label || n.marketplace_category_name || n.category || '';
    if (label) parts.push(label);
    const sub = n.marketplace_subcategory_id;
    if (sub) parts.push(sub.replace(/-/g, ' '));
  }
  return parts.join(' ');
}

/**
 * Bloc note à coller dans le lead lors du transfert Global Monitor → Kanban.
 */
export function equipmentNeedsToNotesBlock(needs: EquipmentNeed[]): string | null {
  if (!needs?.length) return null;
  const lines = needs.slice(0, 10).map((n) => {
    const label =
      n.marketplace_label || n.marketplace_category_name || n.category || 'Cat. à préciser';
    const qty =
      n.qty_min != null && n.qty_max != null ? ` (${n.qty_min}–${n.qty_max} unités)` : '';
    const conf = n.confidence != null ? ` [conf. ${Math.round(Number(n.confidence) * 100)}%]` : '';
    return `· ${label}${qty}${conf}`;
  });
  return ['Besoins matériel (Global Monitor)', ...lines].join('\n');
}

export function monitorNeedsToContext(needs: EquipmentNeed[]): MonitorLeadContext | null {
  if (!needs?.length) return null;
  const scoringText = equipmentNeedsToScoringText(needs);
  if (!scoringText.trim()) return null;
  const displayShort = needs
    .slice(0, 6)
    .map((n) => {
      const l =
        n.marketplace_label || n.marketplace_category_name || n.category || '';
      const q =
        n.qty_min != null && n.qty_max != null ? `${n.qty_min}–${n.qty_max} u.` : '';
      return [l, q].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' · ');
  return {
    scoringText,
    displayShort: displayShort || scoringText.slice(0, 160),
  };
}
