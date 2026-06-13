import React, { useState } from 'react';
import { CheckCircle, Maximize2, Minimize2, X, Layout, Save } from 'lucide-react';
import { WidthProvider, Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { commonServices } from '../../constants/commonServices';
import { NotificationContainer } from '../../components/NotificationToast';
import type { Widget as DashboardWidget } from '../../constants/dashboardTypes';
import WidgetRenderer from '../../components/dashboard/WidgetRenderer';
import { getOrderedAndCompleteLayout } from './layoutHelpers';
import { useShellState } from './useShellState';
import type { ShellLayoutItem, ShellWidget, ShellWidgetsSource } from './shellTypes';
import { useAuth } from '../../hooks/useAuth';

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
  '/#dashboard-entreprise-display',
  '/#planning',
  '/#assistant-ia',
];

export interface EnterpriseDashboardShellProps {
  /** Identifiant du metier utilise comme suffixe localStorage */
  role: string;
  /** Source des widgets disponibles pour ce metier */
  widgetsSource: ShellWidgetsSource;
  /** Liste des IDs de widgets valides pour ce metier */
  validIds: string[];
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
  modalLabel,
}) => {
  const { user } = useAuth();
  const {
    config,
    layout,
    addStatus,
    saveStatus,
    onLayoutChange,
    cycleWidgetHeight,
    resetWidgetSize,
    addWidget,
    removeWidget,
    restoreAllWidgets,
    saveDashboard,
  } = useShellState({ role, widgetsSource, validIds, storageUserId: user?.id });

  const [showAddModal, setShowAddModal] = useState(false);

  const handleWidgetAction = (_action: string, _data: unknown) => {
    // Place reservee pour des hooks d'action widgets (telemetrie, analytics).
    // Intentionnellement no-op : chaque widget gere ses propres actions
    // via WidgetRenderer.
  };

  const renderServices = () => (
    <div className="mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
        {commonServices.map((service, idx) => {
          const Icon = service.icon;
          const link = SERVICE_LINKS[idx] || '#';
          return (
            <a
              key={idx}
              href={link}
              className="flex flex-col items-center justify-center py-2 px-1 rounded transition hover:bg-orange-100 focus:bg-orange-200 cursor-pointer border border-orange-100 bg-orange-50"
              style={{ minWidth: 0, textDecoration: 'none' }}
            >
              <Icon className="h-6 w-6 text-orange-500 mb-1" />
              <span className="text-xs text-orange-800 text-center truncate">{service.title}</span>
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

    const orderedLayouts = getOrderedAndCompleteLayout(
      config.widgets,
      layout.lg,
      config.widgetSizes,
    );

    return (
      <ResponsiveGridLayout
        key={JSON.stringify(orderedLayouts.map((l) => [l.i, l.w, l.h]))}
        className="layout"
        layouts={{ lg: orderedLayouts }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
        rowHeight={90}
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
              className="bg-orange-50 border border-orange-200 rounded-lg flex flex-col h-full group relative"
            >
              <div className="h-full flex flex-col">
                <div className="widget-drag-handle flex justify-between items-center p-4 pb-2 border-b cursor-grab active:cursor-grabbing">
                  <h3 className="text-lg font-bold text-gray-900 select-none">
                    {String(widget.title ?? widget.id)}
                  </h3>
                  <div className="flex space-x-1" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className="p-1 bg-white rounded-full shadow hover:bg-orange-100 transition-colors"
                      title="Agrandir/Réduire la hauteur"
                      onClick={() => cycleWidgetHeight(widget.id)}
                    >
                      {l.h < 6 ? (
                        <Maximize2 className="w-4 h-4 text-orange-600" />
                      ) : (
                        <Minimize2 className="w-4 h-4 text-orange-600" />
                      )}
                    </button>
                    <button
                      className="p-1 bg-white rounded-full shadow hover:bg-orange-100 transition-colors"
                      title="Réinitialiser la taille"
                      onClick={() => resetWidgetSize(widget.id)}
                    >
                      <Layout className="w-4 h-4 text-orange-600" />
                    </button>
                    <button
                      className="p-1 bg-white rounded-full shadow hover:bg-red-100 transition-colors"
                      title="Supprimer"
                      onClick={() => removeWidget(widget.id)}
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto p-4 pb-6"
                  style={{ maxHeight: '100%' }}
                >
                  <WidgetRenderer
                    widget={shellWidgetToDashboardWidget(widget)}
                    widgetSize="medium"
                    onAction={handleWidgetAction}
                    dashboardRole={role}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <NotificationContainer />
      <div className="max-w-6xl mx-auto">
        {renderServices()}

        <div className="flex justify-between items-center mb-4">
          {renderSaveButton()}
          <button
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
            onClick={() => setShowAddModal(true)}
          >
            + Ajouter des widgets
          </button>
        </div>

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
                      <li key={w.id} className="mb-2 flex justify-between items-center">
                        <span>
                          {String(w.title ?? w.id)} ({w.id})
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
    </div>
  );
};

export default EnterpriseDashboardShell;
