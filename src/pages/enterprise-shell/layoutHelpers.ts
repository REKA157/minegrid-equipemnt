import type { ShellLayoutItem, ShellWidget } from './shellTypes';

export function getWidthFromSize(size: string | undefined): number {
  if (size === '1/3') return 4;
  if (size === '1/2') return 6;
  if (size === '2/3') return 8;
  if (size === '1/1') return 12;
  return 4;
}

/**
 * Hauteur (en unités de grille, rowHeight=90px) ADAPTÉE AU CONTENU du widget.
 * Avant, tous les widgets avaient h=2 (≈180px) -> graphes et listes étaient coupés
 * (« ouverts qu'en partie »). On donne une hauteur par défaut généreuse, plus haute
 * pour les graphes, plus compacte pour les cartes de score.
 */
export function getHeightFromWidget(widget: ShellWidget): number {
  const t = (widget.type ?? '').toLowerCase();
  const id = (widget.id ?? '').toLowerCase();
  // Graphes / évolution : besoin de hauteur pour la courbe + légende.
  if (t === 'chart' || id.includes('evolution') || id.includes('sales-chart')) return 5;
  // KPI compacts (score, métrique) : plus courts.
  if (t === 'metric' || t === 'performance' || id.includes('score')) return 3;
  // Listes / pipeline / actions / stock / dossiers / IA : listes scrollables.
  if (
    t === 'list' ||
    t === 'daily-actions' ||
    t === 'ai-insights' ||
    t === 'ai-optimization' ||
    id.includes('pipeline') ||
    id.includes('daily') ||
    id.includes('stock') ||
    id.includes('transaction') ||
    id.includes('insights') ||
    id.includes('optimization')
  )
    return 4;
  return 4; // défaut généreux (le contenu scrolle si besoin, mais plus de clipping à 180px)
}

export function generatePreviewLayout(
  widgets: ShellWidget[],
  widgetSizes: Record<string, string> = {},
): ShellLayoutItem[] {
  const layout: ShellLayoutItem[] = [];
  let x = 0;
  let y = 0;
  let rowMaxH = 0;

  widgets.forEach((widget) => {
    const w = getWidthFromSize(widgetSizes[widget.id] || '1/3');
    const h = getHeightFromWidget(widget);
    if (x + w > 12) {
      x = 0;
      y += rowMaxH || h;
      rowMaxH = 0;
    }
    layout.push({ i: widget.id, x, y, w, h });
    x += w;
    rowMaxH = Math.max(rowMaxH, h);
  });

  return layout;
}

/**
 * A la lecture initiale on recalcule le layout a partir des widgets et des
 * tailles, pour gerer le cas ou le localStorage est desynchronise avec la
 * liste actuelle (widget retire, renomme, etc.).
 */
export function getOrderedAndCompleteLayout(
  widgets: ShellWidget[],
  _layout: ShellLayoutItem[] = [],
  widgetSizes: Record<string, string> = {},
): ShellLayoutItem[] {
  return generatePreviewLayout(widgets, widgetSizes);
}
