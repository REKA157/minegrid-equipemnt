import type { ShellLayoutItem, ShellWidget } from './shellTypes';

export function getWidthFromSize(size: string | undefined): number {
  if (size === '1/3') return 4;
  if (size === '1/2') return 6;
  if (size === '2/3') return 8;
  if (size === '1/1') return 12;
  return 4;
}

/** Conversion inverse : largeur de grille -> ratio le plus proche (1/3, 1/2, 2/3, 1/1). */
export function getSizeFromWidth(w: number): string {
  if (w >= 10) return '1/1';
  if (w >= 7) return '2/3';
  if (w >= 5) return '1/2';
  return '1/3';
}

const VALID_RATIOS = ['1/3', '1/2', '2/3', '1/1'] as const;
function isValidRatio(s: unknown): s is (typeof VALID_RATIOS)[number] {
  return typeof s === 'string' && (VALID_RATIOS as readonly string[]).includes(s);
}

/**
 * Détecte l'empreinte du bug historique du configurateur : TOUTES les tailles
 * forcées à '1/3' (l'init écrasait chaque widget à '1/3'). Un dashboard entier
 * en 1/3 n'est jamais un choix délibéré -> on ignore alors ces « choix » et on
 * retombe sur les défauts par TYPE (graphe 2/3, score 1/3, liste 1/2).
 */
export function isUniformThird(
  widgets: ShellWidget[],
  widgetSizes: Record<string, string> = {},
): boolean {
  const effective = widgets
    .map((w) => {
      const s = widgetSizes[w.id];
      if (isValidRatio(s)) return s;
      if (isValidRatio(w.size)) return w.size;
      return null;
    })
    .filter((s) => s !== null);
  return effective.length >= 2 && effective.every((s) => s === '1/3');
}

/**
 * Ratio de largeur PAR DÉFAUT selon le type de contenu (esthétique lisible) :
 * graphes larges (2/3), scores/KPI compacts (1/3), listes/actions mi-largeur (1/2).
 */
export function getDefaultSizeForWidget(widget: ShellWidget): string {
  const t = (widget.type ?? '').toLowerCase();
  const id = (widget.id ?? '').toLowerCase();
  if (t === 'chart' || id.includes('evolution') || id.includes('sales-chart')) return '2/3';
  if (t === 'metric' || t === 'performance' || id.includes('score')) return '1/3';
  return '1/2';
}

/**
 * SOURCE DE VÉRITÉ UNIQUE de la largeur d'un widget :
 * 1. widgetSizes (ratio choisi au configurateur / par redimensionnement) ;
 * 2. widget.size (ratio intrinsèque de la définition) ;
 * 3. défaut selon le type.
 * Seuls les ratios VALIDES comptent ('medium', 'large'… hérités d'anciens
 * enregistrements sont ignorés).
 */
export function resolveWidgetSize(
  widget: ShellWidget,
  widgetSizes: Record<string, string> = {},
): string {
  const chosen = widgetSizes[widget.id];
  if (isValidRatio(chosen)) return chosen;
  if (isValidRatio(widget.size)) return widget.size;
  return getDefaultSizeForWidget(widget);
}

/**
 * Hauteur INITIALE (en unités de grille, rowHeight=30px) selon le type de widget.
 * Simple point de départ avant la MESURE réelle : à l'affichage, l'auto-hauteur
 * du shell ajuste ensuite chaque carte à la hauteur exacte de son contenu.
 */
export function getHeightFromWidget(widget: ShellWidget): number {
  const t = (widget.type ?? '').toLowerCase();
  // Cartes COMPACTES (principe cockpit) : le shell plafonne à 8 lignes (~352px),
  // l'auto-hauteur ajuste ensuite au contenu réel dans cette limite.
  if (t === 'metric') return 5; // un chiffre clé : plus court
  return 8;
}

export function generatePreviewLayout(
  widgets: ShellWidget[],
  widgetSizes: Record<string, string> = {},
): ShellLayoutItem[] {
  const layout: ShellLayoutItem[] = [];
  let x = 0;
  let y = 0;
  let rowMaxH = 0;

  // Guérison : « tout en 1/3 » = empreinte du bug d'init du configurateur -> défauts par type.
  const healed = isUniformThird(widgets, widgetSizes);

  widgets.forEach((widget) => {
    const w = getWidthFromSize(
      healed ? getDefaultSizeForWidget(widget) : resolveWidgetSize(widget, widgetSizes),
    );
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
 * IMPORTANCE d'un widget pour le rangement « Réorganiser » (0 = plus haut).
 * Un cockpit répond « que faire MAINTENANT ? » : les widgets d'action et
 * d'argent-en-cours remontent, l'analyse descend. Sans ça, un tri par hauteur
 * enterrait un widget court mais crucial (ex. Dossiers transaction).
 */
export function importanceRank(widget: ShellWidget): number {
  const t = (widget.type ?? '').toLowerCase();
  const id = (widget.id ?? '').toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => id.includes(k));
  // 0 — AGIR MAINTENANT : tâches, dossiers/affaires, retards, alertes, pipeline.
  if (
    t === 'daily-actions' ||
    has('daily', 'action', 'transaction', 'dossier', 'case', 'overdue', 'alert',
        'pipeline', 'demurrage', 'payment', 'upcoming', 'active-deliver', 'intervention',
        'repair', 'application', 'opportunit')
  )
    return 0;
  // 1 — OPÉRATIONNEL : stock, disponibilité, statuts, suivi, occupation.
  if (
    has('stock', 'availability', 'inventory', 'occupancy', 'container', 'tracking',
        'status', 'schedule', 'workload', 'parts', 'document', 'client-portfolio')
  )
    return 1;
  // 2 — ANALYSE / synthèse : scores, graphes, KPIs, IA, revenus.
  return 2;
}

/** Élargissements autorisés (on reste dans le vocabulaire 1/3, 1/2, 2/3, 1/1). */
const WIDEN_STEPS: Record<number, number[]> = {
  4: [6, 8, 12],
  6: [8, 12],
  8: [12],
  12: [],
};

/**
 * RANGEMENT « d'un clic » (bouton Réorganiser) : produit un dashboard aligné,
 * sans trous ni puits de vide.
 *  1. Les widgets sont APPARIÉS PAR HAUTEUR (les grandes cartes ensemble, les
 *     petites ensemble) : plus de carte de 200px coincée à côté d'une de 800px.
 *  2. Chaque ligne est COMPLÉTÉE à 12 colonnes : le reste est absorbé en
 *     élargissant les cartes de la ligne (toujours vers un ratio valide
 *     1/2, 2/3, 1/1 -> la disposition reste stable au rechargement).
 */
export function repackLayout(
  widgets: ShellWidget[],
  layout: ShellLayoutItem[] = [],
  widgetSizes: Record<string, string> = {},
): ShellLayoutItem[] {
  const savedById = new Map(layout.map((l) => [l.i, l]));
  const healed = isUniformThird(widgets, widgetSizes);

  const widthOf = (wg: ShellWidget) =>
    getWidthFromSize(healed ? getDefaultSizeForWidget(wg) : resolveWidgetSize(wg, widgetSizes));
  const heightOf = (wg: ShellWidget) => {
    const saved = savedById.get(wg.id);
    return saved && Number.isFinite(saved.h) ? saved.h : getHeightFromWidget(wg);
  };

  // Ordre de lecture actuel (départage à importance + hauteur égales).
  const readOrder = new Map(
    [...widgets]
      .sort((a, b) => {
        const sa = savedById.get(a.id);
        const sb = savedById.get(b.id);
        const ka = sa ? (sa.y ?? 0) * 100 + (sa.x ?? 0) : Number.MAX_SAFE_INTEGER;
        const kb = sb ? (sb.y ?? 0) * 100 + (sb.x ?? 0) : Number.MAX_SAFE_INTEGER;
        return ka - kb;
      })
      .map((w, i) => [w.id, i]),
  );
  // Tri : IMPORTANCE d'abord (agir > opérationnel > analyse), puis hauteur
  // décroissante (appariement anti-trous DANS un même niveau), puis lecture.
  const queue = [...widgets].sort(
    (a, b) =>
      importanceRank(a) - importanceRank(b) ||
      heightOf(b) - heightOf(a) ||
      readOrder.get(a.id)! - readOrder.get(b.id)!,
  );

  const result: ShellLayoutItem[] = [];
  let y = 0;

  while (queue.length) {
    // Compose une ligne : tête de file + tout ce qui tient encore en largeur
    // (la file étant triée par hauteur, les voisins de ligne se ressemblent).
    const row: Array<{ wg: ShellWidget; w: number; h: number }> = [];
    let used = 0;
    for (let i = 0; i < queue.length; ) {
      const w = widthOf(queue[i]);
      if (used + w <= 12) {
        const wg = queue.splice(i, 1)[0];
        row.push({ wg, w, h: heightOf(wg) });
        used += w;
        if (used === 12) break;
      } else {
        i++;
      }
    }

    // Complète la ligne à 12 en élargissant (de droite à gauche) vers des
    // ratios valides uniquement.
    let rest = 12 - used;
    let guard = 8;
    while (rest > 0 && guard-- > 0) {
      let widened = false;
      for (let k = row.length - 1; k >= 0 && rest > 0; k--) {
        const target = (WIDEN_STEPS[row[k].w] ?? []).find((t) => t - row[k].w <= rest);
        if (target) {
          rest -= target - row[k].w;
          row[k].w = target;
          widened = true;
        }
      }
      if (!widened) break;
    }

    // Pose la ligne.
    let x = 0;
    const rowH = Math.max(...row.map((r) => r.h));
    for (const r of row) {
      result.push({ i: r.wg.id, x, y, w: r.w, h: r.h });
      x += r.w;
    }
    y += rowH;
  }

  return result;
}

/**
 * PREMIER EMPLACEMENT LIBRE pour un widget de largeur `w` : balaie la grille
 * existante ligne par ligne et retourne le premier « trou » assez large ;
 * sinon, le bas de la grille. Évite qu'un widget ajouté parte n'importe où.
 */
export function findFirstFreeSlot(
  layout: ShellLayoutItem[],
  w: number,
): { x: number; y: number } {
  if (!layout.length) return { x: 0, y: 0 };

  // Bandes horizontales délimitées par les bords haut/bas des widgets posés.
  const edges = Array.from(
    new Set(layout.flatMap((l) => [l.y, l.y + l.h])),
  ).sort((a, b) => a - b);

  for (const yBand of edges) {
    // Colonnes occupées sur cette bande.
    const taken: Array<[number, number]> = layout
      .filter((l) => l.y <= yBand && yBand < l.y + l.h)
      .map((l) => [l.x, l.x + l.w]);
    taken.sort((a, b) => a[0] - b[0]);
    // Balayage des trous entre intervalles occupés.
    let cursor = 0;
    for (const [start, end] of taken) {
      if (start - cursor >= w) return { x: cursor, y: yBand };
      cursor = Math.max(cursor, end);
    }
    if (12 - cursor >= w) return { x: cursor, y: yBand };
  }

  // Aucun trou : en bas de la grille.
  const bottom = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  return { x: 0, y: bottom };
}

/**
 * Construit le layout affiché.
 *
 * LARGEURS : le RATIO (1/3, 1/2, 2/3, 1/1) est la source de vérité — choix du
 * configurateur (widgetSizes), sinon ratio intrinsèque, sinon défaut par TYPE.
 * Un « tout en 1/3 » (empreinte du bug d'init du configurateur) est guéri en
 * défauts par type.
 *
 * POSITIONS :
 *  - si les largeurs sauvegardées CONCORDENT avec les ratios -> on respecte
 *    x/y/h enregistrés tels quels (drag & drop de l'utilisateur préservé) ;
 *  - si elles DIVERGENT (config corrompue/guérie), les x/y sauvegardés sont
 *    invalides par construction (collisions garanties) -> on RE-PLACE tout en
 *    flux, dans l'ORDRE de la disposition enregistrée (lecture y puis x).
 */
export function getOrderedAndCompleteLayout(
  widgets: ShellWidget[],
  layout: ShellLayoutItem[] = [],
  widgetSizes: Record<string, string> = {},
): ShellLayoutItem[] {
  const savedById = new Map(layout.map((l) => [l.i, l]));

  // Guérison « tout en 1/3 » + résolution des largeurs cibles.
  const healed = isUniformThird(widgets, widgetSizes);
  const targetW = new Map(
    widgets.map((widget) => [
      widget.id,
      getWidthFromSize(
        healed ? getDefaultSizeForWidget(widget) : resolveWidgetSize(widget, widgetSizes),
      ),
    ]),
  );

  // Les positions sauvegardées ne restent valables que si AUCUNE largeur ne change.
  const widthsMatchSaved = widgets.every((widget) => {
    const saved = savedById.get(widget.id);
    return !saved || saved.w === targetW.get(widget.id);
  });

  if (widthsMatchSaved) {
    const result: ShellLayoutItem[] = [];
    // Curseur d'auto-placement pour les widgets SANS position enregistrée :
    // on les pose SOUS la grille existante, sans perturber le reste.
    let cursorX = 0;
    let cursorY = layout.reduce((m, l) => Math.max(m, (l.y ?? 0) + (l.h ?? 0)), 0);
    let rowMaxH = 0;

    for (const widget of widgets) {
      const saved = savedById.get(widget.id);
      const w = targetW.get(widget.id) ?? 4;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.h)) {
        // Disposition ENREGISTRÉE respectée telle quelle.
        result.push({ i: widget.id, x: saved.x, y: saved.y, w, h: saved.h });
      } else {
        const h = getHeightFromWidget(widget);
        if (cursorX + w > 12) {
          cursorX = 0;
          cursorY += rowMaxH || h;
          rowMaxH = 0;
        }
        result.push({ i: widget.id, x: cursorX, y: cursorY, w, h });
        cursorX += w;
        rowMaxH = Math.max(rowMaxH, h);
      }
    }
    return result;
  }

  // RE-FLUX complet : largeurs corrigées => re-placement propre en lignes,
  // dans l'ordre de lecture de la disposition enregistrée (y, puis x).
  const ordered = [...widgets].sort((a, b) => {
    const sa = savedById.get(a.id);
    const sb = savedById.get(b.id);
    const ka = sa ? (sa.y ?? 0) * 100 + (sa.x ?? 0) : Number.MAX_SAFE_INTEGER;
    const kb = sb ? (sb.y ?? 0) * 100 + (sb.x ?? 0) : Number.MAX_SAFE_INTEGER;
    return ka - kb;
  });

  const result: ShellLayoutItem[] = [];
  let x = 0;
  let y = 0;
  let rowMaxH = 0;
  for (const widget of ordered) {
    const w = targetW.get(widget.id) ?? 4;
    const h = getHeightFromWidget(widget);
    if (x + w > 12) {
      x = 0;
      y += rowMaxH || h;
      rowMaxH = 0;
    }
    result.push({ i: widget.id, x, y, w, h });
    x += w;
    rowMaxH = Math.max(rowMaxH, h);
  }
  return result;
}
