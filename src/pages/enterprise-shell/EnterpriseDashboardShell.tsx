import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { CheckCircle, Expand, GripHorizontal, LayoutGrid, Shrink, X, Layout, Save } from 'lucide-react';
import { WidthProvider, Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { commonServices } from '../../constants/commonServices';
import { NotificationContainer } from '../../components/NotificationToast';
import type { Widget as DashboardWidget } from '../../constants/dashboardTypes';
import WidgetRenderer from '../../components/dashboard/WidgetRenderer';
import CockpitSummary from '../../components/dashboard/cockpit/CockpitSummary';
import { getOrderedAndCompleteLayout } from './layoutHelpers';
import { useShellState } from './useShellState';
import type { ShellLayoutItem, ShellWidget, ShellWidgetsSource } from './shellTypes';
import { useAuth } from '../../hooks/useAuth';
import InfoTooltip from '../../components/common/InfoTooltip';
import { WIDGET_ROLE_HINTS } from '../../constants/widgetRoleHints';
import { WIDGET_EXPLANATIONS } from '../../constants/widgetExplanations';

const DASHBOARD_WIDGET_TYPES: readonly DashboardWidget['type'][] = [
  'metric',
  'chart',
  'list',
  'calendar',
  'map',
  'equipment',
  'maintenance',
  'performance',
  'pipeline',
  'priority',
  'analytics',
  'daily-actions',
  'daily-priority',
  'inventory',
  'equipment-catalog',
  'customer-leads',
  'quotes-management',
  'after-sales-service',
  'market-trends',
  'sales-analytics',
  'ai-insights',
  'ai-optimization',
] as const;

function shellWidgetToDashboardWidget(w: ShellWidget): DashboardWidget {
  const raw = typeof w.type === 'string' ? w.type : '';
  const type: DashboardWidget['type'] = DASHBOARD_WIDGET_TYPES.includes(raw as DashboardWidget['type'])
    ? (raw as DashboardWidget['type'])
    : 'analytics';

  return {
    id: w.id,
    type,
    title: String(w.title ?? w.id),
    description: String(w.description ?? ''),
    icon: w.icon ?? null,
    enabled: typeof w.enabled === 'boolean' ? w.enabled : true,
    dataSource: String(w.dataSource ?? w.id),
  };
}

const ResponsiveGridLayout = WidthProvider(Responsive);

/** Liens des services communs (ordre : Vitrine, Publication, Devis, Documents, Messages, TdB, Planning, Assistant IA) */
const SERVICE_LINKS = [
  '/#vitrine',
  '/#publication',
  '/#devis',
  '/#documents',
  '/#messages',
  '/#planning',
  '/#assistant-ia',
];

export interface EnterpriseDashboardShellProps {
  /** Identifiant du metier utilise comme suffixe localStorage */
  role: string;
  /** Source des widgets disponibles pour ce metier */
  widgetsSource: ShellWidgetsSource;
  /** Liste des IDs de widgets valides pour ce metier (= catalogue ajoutable) */
  validIds: string[];
  /** Sous-ensemble ordonné actif PAR DÉFAUT (dashboard épuré) ; le reste reste ajoutable. */
  defaultActiveIds?: string[];
  /**
   * Afficher le bandeau de synthèse « Aujourd'hui » (cockpit). Défaut : true.
   * Mettre false quand ses signaux (priorités/risques/opportunités) vivent déjà dans
   * les widgets adaptés (ex. vendeur : Actions + Recommandations IA) -> pas de doublon.
   */
  showCockpit?: boolean;
  /** Libelle de la modale "Ajouter un ..." (ex: "widget mecanicien") */
  modalLabel: string;
}

/**
 * Shell commun aux 8 dashboards Enterprise. Mutualise la grille,
 * les boutons, la modale d'ajout, les services communs et la logique
 * de persistance. Les widgets metier restent distincts a 100%.
 */
export const EnterpriseDashboardShell: React.FC<EnterpriseDashboardShellProps> = ({
  role,
  widgetsSource,
  validIds,
  defaultActiveIds,
  showCockpit = true,
  modalLabel,
}) => {
  const { user } = useAuth();
  const {
    config,
    layout,
    addStatus,
    saveStatus,
    lastAddedId,
    onLayoutChange,
    resetWidgetSize,
    reorganizeLayout,
    addWidget,
    removeWidget,
    restoreAllWidgets,
    saveDashboard,
  } = useShellState({ role, widgetsSource, validIds, defaultActiveIds, storageUserId: user?.id });

  const [showAddModal, setShowAddModal] = useState(false);

  // MODE COCKPIT (plein écran) : option de CONFORT — réunion, écran mural.
  // Le dashboard doit rester exploitable SANS lui (cartes compactes, détail à
  // la demande) ; ici on masque juste la navigation pour maximiser les widgets.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isCockpit, setIsCockpit] = useState(false);
  useEffect(() => {
    const onFsChange = () => setIsCockpit(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);
  const toggleCockpit = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen();
    }
  };

  // Guide de première visite (refermable, mémorisé par navigateur).
  const HELP_KEY = 'enterpriseShellHelpDismissed';
  const [showHelp, setShowHelp] = useState(() => localStorage.getItem(HELP_KEY) !== '1');
  const dismissHelp = () => {
    localStorage.setItem(HELP_KEY, '1');
    setShowHelp(false);
  };

  // Widget fraîchement ajouté : on défile jusqu'à lui (le surlignage est appliqué
  // sur sa carte via lastAddedId dans le rendu).
  useEffect(() => {
    if (!lastAddedId) return;
    const t = window.setTimeout(() => {
      gridRef.current
        ?.querySelector(`[data-widget-id="${lastAddedId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [lastAddedId]);

  // ---------------------------------------------------------------------------
  // AUTO-HAUTEUR AJUSTÉE : chaque carte ÉPOUSE la hauteur de son contenu.
  // On MESURE la hauteur naturelle (entête + contenu) et on cale la case dessus,
  // dans les DEUX sens : plus de contenu coupé, plus de grands vides en bas.
  // Bornes : min 3 lignes (carte cliquable), max ~1 écran (au-delà, la longue
  // liste défile à l'intérieur). Les LARGEURS restent pilotées par les ratios.
  // ---------------------------------------------------------------------------
  // On NE peut pas poser de ref sur les enfants de la grille : react-grid-layout les
  // clone (cloneElement) et écrase le ref. On scanne donc le DOM via un conteneur,
  // chaque case portant un data-widget-id.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [fittedHeights, setFittedHeights] = useState<Record<string, number>>({});

  // Doit rester synchronisé avec <ResponsiveGridLayout rowHeight/margin/> ci-dessous.
  // Ligne FINE (30px) => le « pas » de hauteur est de 46px : la carte colle au
  // contenu à ±46px près (avec 90px, on gaspillait jusqu'à ~106px par carte).
  const ROW_PX = 30;
  const MARGIN_Y = 16;
  // PRINCIPE COCKPIT : une carte est un RÉSUMÉ compact (~350px max), jamais un
  // mur vertical. Le contenu long est coupé proprement et le bouton « Voir le
  // détail complet » (bas de carte) ouvre le widget ENTIER dans une grande
  // fenêtre. À zoom 100 %, l'ensemble du tableau de bord reste embrassable.
  const MAX_ROWS = 8; // 8*30 + 7*16 = 352px max par carte
  // Nombre de lignes de grille pour afficher `px` sans coupe (formule react-grid-layout :
  // hauteur_px = ROW_PX*h + MARGIN_Y*(h-1)  =>  h = ceil((px + MARGIN_Y)/(ROW_PX + MARGIN_Y))).
  const pxToRows = (px: number) =>
    Math.min(MAX_ROWS, Math.max(3, Math.ceil((px + MARGIN_Y) / (ROW_PX + MARGIN_Y))));
  // Widgets dont le contenu dépasse la carte compacte -> bouton « Voir le détail ».
  const [overflowingIds, setOverflowingIds] = useState<Record<string, boolean>>({});
  // Widget ouvert en GRANDE fenêtre (détail à la demande).
  const [detailWidget, setDetailWidget] = useState<ShellWidget | null>(null);

  // Layout affiché = disposition enregistrée ; la hauteur MESURÉE fait foi dès
  // qu'elle est connue (ajustée au contenu, bornée min/max).
  const baseLayouts = config
    ? getOrderedAndCompleteLayout(config.widgets, layout.lg, config.widgetSizes)
    : [];
  const orderedLayouts: ShellLayoutItem[] = baseLayouts.map((l) => {
    const fitted = fittedHeights[l.i];
    return fitted != null && fitted !== l.h ? { ...l, h: fitted } : l;
  });
  // Clé de la grille : NE dépend QUE de l'ensemble (id + largeur). Un changement de
  // hauteur (auto-hauteur) passe par la prop `layouts` SANS remonter la grille — sinon
  // chaque widget se démonterait, relancerait ses fetch et la mesure ne convergerait jamais.
  const structureSignature = orderedLayouts.map((l) => `${l.i}:${l.w}`).join('|');

  useLayoutEffect(() => {
    const root = gridRef.current;
    if (!root) return;

    const measureAll = () => {
      const over: Record<string, boolean> = {};
      setFittedHeights((prev) => {
        let changed = false;
        const next = { ...prev };
        root.querySelectorAll<HTMLElement>('.react-grid-item[data-widget-id]').forEach((el) => {
          const id = el.getAttribute('data-widget-id');
          if (!id) return;
          const header = el.querySelector('[data-shell-header]') as HTMLElement | null;
          const content = el.querySelector('[data-shell-content]') as HTMLElement | null;
          if (!content) return;
          // +12px de marge : évite une coupe au pixel près (bordures/arrondis).
          const neededPx = (header?.offsetHeight ?? 0) + content.offsetHeight + 12;
          const rows = pxToRows(neededPx);
          if (rows !== next[id]) {
            next[id] = rows;
            changed = true;
          }
          // Contenu plus long que la carte compacte -> bouton « Voir le détail ».
          const rawRows = Math.ceil((neededPx + MARGIN_Y) / (ROW_PX + MARGIN_Y));
          over[id] = rawRows > MAX_ROWS;
        });
        return changed ? next : prev;
      });
      setOverflowingIds((prev) => {
        const keys = Object.keys(over);
        const same =
          keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === over[k]);
        return same ? prev : over;
      });
    };

    measureAll();

    // Contenus async (graphes, données) et entête qui s'affine : on re-mesure à
    // chaque variation. La grille ne remonte pas sur un changement de hauteur,
    // donc les nœuds restent montés et l'ajustement converge sans clignoter.
    const ro = new ResizeObserver(measureAll);
    root
      .querySelectorAll('[data-shell-content], [data-shell-header]')
      .forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [structureSignature]);

  const handleWidgetAction = (_action: string, _data: unknown) => {
    // Place reservee pour des hooks d'action widgets (telemetrie, analytics).
    // Intentionnellement no-op : chaque widget gere ses propres actions
    // via WidgetRenderer.
  };

  const renderServices = () => (
    <div className="mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
        {commonServices.map((service, idx) => {
          const Icon = service.icon;
          const link = SERVICE_LINKS[idx] || '#';
          return (
            <a
              key={idx}
              href={link}
              title={service.description}
              className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center no-underline shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600 transition-colors group-hover:bg-orange-100">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium leading-tight text-gray-700 group-hover:text-orange-700">
                {service.title}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );

  const renderSaveButton = () => (
    <button
      className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 ${
        saveStatus === 'saving'
          ? 'bg-orange-500 text-white cursor-not-allowed'
          : saveStatus === 'saved'
            ? 'bg-orange-400 text-white'
            : 'bg-orange-600 text-white hover:bg-orange-700 hover:shadow-lg'
      }`}
      onClick={saveDashboard}
      disabled={saveStatus === 'saving'}
    >
      {saveStatus === 'saving' ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Sauvegarde...</span>
        </>
      ) : saveStatus === 'saved' ? (
        <>
          <CheckCircle className="w-4 h-4" />
          <span>Sauvegardé !</span>
        </>
      ) : (
        <>
          <Save className="w-4 h-4" />
          <span>Sauvegarder</span>
        </>
      )}
    </button>
  );

  const renderWidgets = () => {
    if (!config || !config.widgets || config.widgets.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">Aucun widget configuré</div>
          <button
            onClick={restoreAllWidgets}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
          >
            Restaurer tous les widgets
          </button>
        </div>
      );
    }

    const widgetsById = config.widgets.reduce<Record<string, (typeof config.widgets)[number]>>(
      (acc, widget) => {
        acc[widget.id] = widget;
        return acc;
      },
      {},
    );

    return (
      <div ref={gridRef}>
      <ResponsiveGridLayout
        key={structureSignature}
        className="layout"
        // MÊME layout à TOUS les breakpoints (12 colonnes partout) : le conteneur
        // (max-w-6xl ≈ 1104px) est SOUS le seuil lg=1200, donc la grille vit en
        // 'md' — sans entrée md explicite elle synthétiserait son propre layout
        // et nos largeurs/positions ne seraient pas appliquées.
        layouts={{
          lg: orderedLayouts,
          md: orderedLayouts,
          sm: orderedLayouts,
          xs: orderedLayouts,
          xxs: orderedLayouts,
        }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
        rowHeight={30}
        isDraggable
        isResizable
        draggableHandle=".widget-drag-handle"
        margin={[16, 16]}
        useCSSTransforms
        compactType="vertical"
        onLayoutChange={(l: ShellLayoutItem[]) => onLayoutChange(l)}
      >
        {orderedLayouts.map((l) => {
          const widget = widgetsById[l.i];
          if (!widget) return null;
          return (
            <div
              key={widget.id}
              data-grid={l}
              data-widget-id={widget.id}
              className={`bg-orange-50 border border-orange-200 rounded-lg flex flex-col h-full group relative overflow-hidden ${
                widget.id === lastAddedId ? 'ring-2 ring-orange-500 animate-pulse' : ''
              }`}
            >
              <div className="h-full flex flex-col">
                {/* RÈGLE DÉTERMINISTE : la barre de carte porte TOUJOURS le titre —
                    et lui seul (les en-têtes internes des widgets ont été retirés).
                    Fini les cartes sans titre ou avec titre en double. */}
                <div
                  data-shell-header
                  className="widget-drag-handle flex justify-between items-center border-b cursor-grab active:cursor-grabbing px-3 py-2"
                >
                  {/* Poignée TOUJOURS visible (affordance de déplacement). */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <GripHorizontal className="w-4 h-4 text-orange-400 shrink-0" />
                    <h3
                      className="text-base font-bold text-gray-900 select-none min-w-0 truncate"
                      title={String(widget.title ?? widget.id)}
                    >
                      {String(widget.title ?? widget.id)}
                    </h3>
                    {(() => {
                      // « i » d'aide : phrase courte au survol (description persistée
                      // sinon rôle par type) + explication détaillée au clic (par id
                      // sinon par type). Un widget sans explication montre la phrase courte.
                      // `type` est optionnel : clé vide => aucune entrée trouvée (repli identique).
                      const widgetType = widget.type ?? '';
                      const hint = widget.description || WIDGET_ROLE_HINTS[widgetType] || '';
                      const details =
                        WIDGET_EXPLANATIONS[widget.id] || WIDGET_EXPLANATIONS[widgetType];
                      return hint || details ? (
                        <InfoTooltip
                          text={hint || String(widget.title ?? widget.id)}
                          title={String(widget.title ?? widget.id)}
                          details={details}
                        />
                      ) : null;
                    })()}
                  </div>
                  <div className="flex space-x-1 shrink-0 ml-2" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 bg-white rounded-full shadow hover:bg-orange-100 transition-colors"
                      title="Réinitialiser la taille"
                      onClick={() => resetWidgetSize(widget.id)}
                    >
                      <Layout className="w-4 h-4 text-orange-600" />
                    </button>
                    <button
                      className="p-1 bg-white rounded-full shadow hover:bg-red-100 transition-colors"
                      title="Retirer ce widget"
                      onClick={() => {
                        // Garde-fou anti-mauvais-clic + rappel que c'est réversible.
                        if (
                          window.confirm(
                            'Retirer ce widget du tableau de bord ?\nVous pourrez le réajouter à tout moment via « + Ajouter des widgets ».',
                          )
                        ) {
                          removeWidget(widget.id);
                        }
                      }}
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
                  style={{ maxHeight: '100%' }}
                >
                  {/* Wrapper MESURÉ : non étiré -> son offsetHeight = hauteur naturelle
                      du contenu (padding compris). Sert de base à l'auto-hauteur.
                      break-words : aucun texte ne déborde de la carte. */}
                  <div data-shell-content className="p-3 min-w-0 max-w-full break-words">
                    <WidgetRenderer
                      widget={shellWidgetToDashboardWidget(widget)}
                      // Densité ADAPTÉE à la largeur RÉELLE de la carte : les widgets
                      // ajustent items affichés, hauteur de graphe et troncatures.
                      widgetSize={l.w >= 7 ? 'large' : l.w >= 5 ? 'medium' : 'small'}
                      onAction={handleWidgetAction}
                      dashboardRole={role}
                    />
                  </div>
                </div>
                {/* Contenu plus long que la carte compacte : le DÉTAIL s'ouvre à la
                    demande, dans une grande fenêtre — principe cockpit. */}
                {overflowingIds[widget.id] && (
                  <button
                    className="shrink-0 w-full text-center text-xs font-semibold text-orange-700 py-1.5 border-t border-orange-200 bg-orange-100/70 hover:bg-orange-200/70 transition-colors"
                    onClick={() => setDetailWidget(widget)}
                  >
                    Voir le détail complet
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className={`min-h-screen bg-gray-50 p-6 ${isCockpit ? 'h-screen overflow-y-auto' : ''}`}
    >
      <NotificationContainer />
      {/* Largeur ÉLARGIE (1536px au lieu de 1152px) : une carte 1/3 passe de ~360px
          à ~490px de large -> les contenus (listes, cartes machines) respirent. */}
      <div className="max-w-screen-2xl mx-auto">
        {/* En mode cockpit, on masque la navigation secondaire : place aux widgets. */}
        {showCockpit && !isCockpit && <CockpitSummary role={role} />}
        {!isCockpit && renderServices()}

        {/* Barre d'outils UNIFIÉE : le dashboard se présente (titre métier) et
            regroupe ses 3 actions au même endroit — plus de boutons éparpillés. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              Tableau de bord — {role.charAt(0).toUpperCase() + role.slice(1)}
            </h1>
            <p className="text-xs text-gray-500">
              Déplacez les cartes par leur barre du haut · redimensionnez par le coin bas-droit
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              className="px-4 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-2"
              title={isCockpit ? 'Quitter le plein écran' : 'Plein écran : masque la navigation, maximise les widgets (réunion, écran mural)'}
              onClick={toggleCockpit}
            >
              {isCockpit ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
              {isCockpit ? 'Quitter' : 'Mode cockpit'}
            </button>
            <button
              className="px-4 py-2 bg-white border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-2"
              title="Range automatiquement toutes les cartes en lignes pleines, sans trous"
              onClick={reorganizeLayout}
            >
              <LayoutGrid className="w-4 h-4" />
              Réorganiser
            </button>
            <button
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              onClick={() => setShowAddModal(true)}
            >
              + Ajouter des widgets
            </button>
            {renderSaveButton()}
          </div>
        </div>

        {/* Guide de PREMIÈRE VISITE : 4 gestes expliqués en clair, refermable. */}
        {showHelp && !isCockpit && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-sm text-blue-900">
              <div className="font-semibold mb-1">💡 Comment utiliser votre tableau de bord</div>
              <ul className="space-y-0.5 list-disc list-inside text-blue-800">
                <li><b>Déplacer</b> une carte : saisissez-la par sa barre du haut et glissez-la.</li>
                <li><b>Redimensionner</b> : tirez le coin en bas à droite d'une carte.</li>
                <li><b>Réorganiser</b> : range toutes les cartes automatiquement, sans trous.</li>
                <li>Vos changements sont <b>enregistrés automatiquement</b> — « Sauvegarder » force l'enregistrement immédiat.</li>
              </ul>
            </div>
            <button
              className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              onClick={dismissHelp}
            >
              Compris
            </button>
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h2 className="text-lg font-bold mb-4">Ajouter un {modalLabel}</h2>
              <div className="mb-2 text-xs text-gray-500">
                {widgetsSource.widgets.filter((w) => validIds.includes(w.id)).length} widget(s)
                installable(s) pour ce métier
              </div>
              <ul>
                {widgetsSource.widgets
                  .filter((w) => validIds.includes(w.id))
                  .map((w) => {
                    const isInstalled = config?.widgets.some((cw) => cw.id === w.id) ?? false;
                    const added = addStatus[w.id] === 'added';
                    return (
                      <li key={w.id} className="mb-2 flex justify-between items-center gap-2">
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-900">{String(w.title ?? w.id)}</span>
                          {w.description ? (
                            <span className="block text-xs text-gray-500 line-clamp-1">{String(w.description)}</span>
                          ) : null}
                        </span>
                        {isInstalled ? (
                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                            Installé
                          </span>
                        ) : added ? (
                          <span className="ml-2 px-2 py-1 bg-green-200 text-green-800 rounded text-xs">
                            Ajouté !
                          </span>
                        ) : (
                          <button
                            className="ml-2 px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                            onClick={() => addWidget(w.id)}
                            disabled={added}
                          >
                            Ajouter
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
              <button
                className="mt-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                onClick={() => setShowAddModal(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {renderWidgets()}
      </div>

      {/* GRANDE FENÊTRE DE DÉTAIL : le widget entier, à la demande (principe
          cockpit : la carte résume, le détail s'ouvre ici). */}
      {detailWidget && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setDetailWidget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {String(detailWidget.title ?? detailWidget.id)}
              </h2>
              <button
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                title="Fermer"
                onClick={() => setDetailWidget(null)}
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <WidgetRenderer
                widget={shellWidgetToDashboardWidget(detailWidget)}
                widgetSize="large"
                onAction={handleWidgetAction}
                dashboardRole={role}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnterpriseDashboardShell;
