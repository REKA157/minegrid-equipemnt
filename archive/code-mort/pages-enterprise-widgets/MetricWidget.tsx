import { Widget } from '../types';
import { useAdaptiveWidget } from './useAdaptiveWidget';
import { iconMap } from './iconMap';
import { DollarSign, TrendingUp, X } from 'lucide-react';
import React, { useState } from 'react';
import { DonutChart } from './DonutChart';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const MetricWidget = ({ 
  widget, 
  data, 
  widgetSize = 'normal'
}: { 
  widget: Widget; 
  data: any; 
  widgetSize?: 'small' | 'normal' | 'large';
}) => {
  const { currentCurrency } = useWidgetMadCurrency();
  // Utiliser le hook d'adaptation
  const { getTextSize, getGridCols, formatCurrency, formatNumber } = useAdaptiveWidget(widgetSize);

  // Récupérer l'icône depuis le mapping
  const IconComponent = typeof widget.icon === 'string' ? iconMap[widget.icon] : widget.icon;
  const Icon = IconComponent || DollarSign; // Fallback vers DollarSign

  console.log(`MetricWidget ${widget.id}:`, { widget, data });

  // États pour les fonctionnalités avancées
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'current' | 'previous' | 'forecast'>('current');

  // Fonction pour formater les pourcentages
  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  // Données étendues pour le widget ventes
  const getExtendedSalesData = () => {
    if (widget.id === 'sales-metrics' && data) {
      const currentRevenue = data.revenue || 0;
      const currentCount = data.count || 0;
      const currentGrowth = data.growth || 0;

      return {
        current: {
          revenue: currentRevenue,
          count: currentCount,
          growth: currentGrowth,
          averageTicket: currentCount > 0 ? currentRevenue / currentCount : 0
        },
        previous: {
          revenue: currentRevenue / (1 + currentGrowth / 100),
          count: Math.floor(currentCount * 0.9), // Estimation
          growth: currentGrowth * 0.8, // Estimation
          averageTicket: currentCount > 0 ? (currentRevenue / (1 + currentGrowth / 100)) / Math.floor(currentCount * 0.9) : 0
        },
        forecast: {
          revenue: currentRevenue * (1 + currentGrowth / 100),
          count: Math.floor(currentCount * 1.1), // Estimation
          growth: currentGrowth * 1.2, // Estimation
          averageTicket: currentCount > 0 ? (currentRevenue * (1 + currentGrowth / 100)) / Math.floor(currentCount * 1.1) : 0
        }
      };
    }
    return null;
  };

  const extendedData = getExtendedSalesData();

  // Fonction pour afficher les données métriques de manière générique
  const renderMetricData = () => {
    if (!data) {
      return (
        <div className="text-center text-gray-500 dark:text-gray-400 py-4">
          Données non disponibles
        </div>
      );
    }

    // Si c'est un objet avec des propriétés spécifiques
    if (typeof data === 'object' && data !== null) {
      // Chercher les propriétés numériques principales
      const mainValue = data.revenue || data.count || data.value || data.occupancy || data.declarations || data.active;
      const secondaryValue = data.count || data.growth || data.completed || data.pending || data.in_transit || data.delivered;
      const thirdValue = data.growth || data.pending || data.available || data.approved;

      if (mainValue !== undefined) {
        // Special case for interventions
        if (data.completed !== undefined && data.pending !== undefined) {
            return (
                <div className="text-center">
                    <DonutChart completed={data.completed} pending={data.pending} />
                    <div className="flex justify-center space-x-4 text-xs">
                        <div className="flex items-center">
                            <span className="w-2 h-2 rounded-full bg-orange-600 mr-2"></span>
                            <span>Terminées: {data.completed}</span>
                        </div>
                        <div className="flex items-center">
                            <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-600 mr-2"></span>
                            <span className="dark:text-gray-300">En attente: {data.pending}</span>
                        </div>
                    </div>
                </div>
            )
        }

        // Widget Ventes du mois avec fonctionnalités avancées
        if (widget.id === 'sales-metrics' && extendedData) {
          const currentData = extendedData[selectedPeriod];

          return (
            <div className="space-y-3">
              {/* Contrôles de période */}
              <div className="flex space-x-1">
                <button
                  onClick={() => setSelectedPeriod('current')}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedPeriod === 'current'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Actuel
                </button>
                <button
                  onClick={() => setSelectedPeriod('previous')}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedPeriod === 'previous'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Précédent
                </button>
                <button
                  onClick={() => setSelectedPeriod('forecast')}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedPeriod === 'forecast'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Prévision
                </button>
              </div>

              {/* Indicateurs de performance */}
              <div className={`grid grid-cols-${getGridCols(2)} gap-${widgetSize === 'small' ? '1' : widgetSize === 'large' ? '3' : '2'} text-xs`}>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <div className="font-semibold text-orange-600">
                    {currentData.growth >= 0 ? '+' : ''}{currentData.growth.toFixed(1)}%
                  </div>
                  <div className="text-orange-700">Croissance</div>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <div className="font-semibold text-orange-600">
                    {formatCurrency(currentData.averageTicket)}
                  </div>
                  <div className="text-orange-700">Ticket moyen</div>
                </div>
              </div>

              {/* Valeur principale */}
              <div className="text-center">
                <div className={`${getTextSize('value')} font-bold text-gray-900`}>
                  {formatCurrency(currentData.revenue)}
                </div>
                <div className={`${getTextSize('subtitle')} text-gray-600`}>
                  {selectedPeriod === 'current' ? 'CA du mois' :
                   selectedPeriod === 'previous' ? 'CA mois précédent' : 'CA prévisionnel'}
                </div>
              </div>

              {/* Métriques secondaires */}
              <div className={`grid grid-cols-${getGridCols(2)} gap-${widgetSize === 'small' ? '1' : widgetSize === 'large' ? '3' : '2'} text-xs`}>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="font-semibold text-gray-900">{currentData.count}</div>
                  <div className="text-gray-600">Ventes</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(currentData.averageTicket)}
                  </div>
                  <div className="text-gray-600">Panier moyen</div>
                </div>
              </div>

              {/* Croissance */}
              {currentData.growth !== undefined && (
                <div className="flex items-center justify-center text-xs">
                  <TrendingUp className={`h-3 w-3 mr-1 ${currentData.growth >= 0 ? 'text-orange-500' : 'text-red-500'}`} />
                  <span className={currentData.growth >= 0 ? 'text-orange-600' : 'text-red-600'}>
                    {formatPercentage(currentData.growth)} vs mois précédent
                  </span>
                </div>
              )}

              {/* Bouton détails */}
              <button
                onClick={() => setShowDetails(true)}
                className="w-full mt-2 px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
              >
                Voir détails
              </button>
            </div>
          );
        }

        return (
          <>
            <div className="text-2xl font-bold text-gray-900">
              {typeof mainValue === 'number' ? mainValue.toLocaleString() : mainValue}
              {data.occupancy ? '%' : data.revenue || data.value ? ` ${currentCurrency}` : ''}
            </div>
            <div className="text-xs text-gray-600">
              {widget.description}
            </div>
            {secondaryValue !== undefined && (
              <div className="flex items-center justify-between text-xs">
                {data.completed !== undefined && (
                  <span className="text-orange-600">{data.completed} terminées</span>
                )}
                {data.pending !== undefined && (
                  <span className="text-orange-600">{data.pending} en attente</span>
                )}
                {data.in_transit !== undefined && (
                  <span className="text-orange-600">{data.in_transit} en transit</span>
                )}
                {data.delivered !== undefined && (
                  <span className="text-orange-600">{data.delivered} livrées</span>
                )}
                {data.approved !== undefined && (
                  <span className="text-orange-600">{data.approved} approuvées</span>
                )}
                {data.available !== undefined && (
                  <span className="text-gray-600">{data.available}% disponible</span>
                )}
              </div>
            )}
            {data.growth !== undefined && (
              <div className="flex items-center text-xs">
                <TrendingUp className="h-3 w-3 text-orange-500 mr-1" />
                <span className="text-orange-600">+{data.growth}% vs mois dernier</span>
              </div>
            )}
            {data.occupancy !== undefined && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div className="bg-orange-600 h-1.5 rounded-full" style={{ width: `${data.occupancy}%` }}></div>
              </div>
            )}
            {data.risk !== undefined && (
              <div className="text-xs text-gray-600">Risque: {data.risk}</div>
            )}
          </>
        );
      }
    }

    // Fallback pour les données simples
    return (
      <div className="text-center text-gray-500 py-4">
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {typeof data === 'number' ? data.toLocaleString() : String(data)}
        </div>
        <div className="text-sm text-gray-600">{widget.description}</div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {renderMetricData()}

      {/* Modal de détails pour les ventes */}
      {showDetails && extendedData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Détails des Ventes</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Comparaison des périodes */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Comparaison des Périodes</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-600">Mois Précédent</div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(extendedData.previous.revenue)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {extendedData.previous.count} ventes
                    </div>
                  </div>

                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-sm font-medium text-orange-600">Mois Actuel</div>
                    <div className="text-lg font-bold text-orange-900">
                      {formatCurrency(extendedData.current.revenue)}
                    </div>
                    <div className="text-xs text-orange-500">
                      {extendedData.current.count} ventes
                    </div>
                  </div>

                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-sm font-medium text-orange-600">Prévision</div>
                    <div className="text-lg font-bold text-orange-900">
                      {formatCurrency(extendedData.forecast.revenue)}
                    </div>
                    <div className="text-xs text-orange-500">
                      {extendedData.forecast.count} ventes
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyse détaillée */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Analyse Détaillée</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Croissance CA</span>
                    <span className={`text-sm font-semibold ${extendedData.current.growth >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                      {formatPercentage(extendedData.current.growth)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Panier moyen</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(extendedData.current.averageTicket)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-sm text-gray-600">Nombre de ventes</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {extendedData.current.count}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Actions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button className="px-4 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors">
                    Exporter rapport
                  </button>
                  <button className="px-4 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors">
                    Planifier actions
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
