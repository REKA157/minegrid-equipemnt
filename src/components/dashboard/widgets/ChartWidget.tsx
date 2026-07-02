import React, { useState } from 'react';
import { TrendingUp, TrendingDown, BarChart3, PieChart, LineChart, X } from 'lucide-react';
import { Widget } from '../../../constants/dashboardTypes';
import { formatCurrency, formatNumber } from '../../../utils/dashboardUtils';
import { useCurrencyStore } from '../../../stores/currencyStore';

interface ChartWidgetProps {
  widget: Widget;
  data: any[];
  widgetSize?: 'small' | 'medium' | 'large';
}

const ChartWidget: React.FC<ChartWidgetProps> = ({ widget, data, widgetSize = 'medium' }) => {
  useCurrencyStore((s) => s.currentCurrency);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [showDetails, setShowDetails] = useState(false);

  // Fonction pour obtenir la taille adaptative
  const getAdaptiveSize = (type: 'text' | 'spacing' | 'grid') => {
    switch (widgetSize) {
      case 'small':
        return type === 'text' ? 'text-xs' : type === 'spacing' ? 'p-2' : 'grid-cols-1';
      case 'large':
        return type === 'text' ? 'text-lg' : type === 'spacing' ? 'p-6' : 'grid-cols-3';
      default:
        return type === 'text' ? 'text-sm' : type === 'spacing' ? 'p-4' : 'grid-cols-2';
    }
  };

  // Fonction pour calculer les statistiques
  const calculateStats = () => {
    if (!data || data.length === 0) return null;

    const values = data.map(item => item.value || item.CA || 0);
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    // Évolution = variation 1re→dernière valeur. Garde anti division par zéro :
    // si la 1re valeur est 0, le % est indéterminé (évite +Infinity / NaN affichés).
    const first = values[0];
    const last = values[values.length - 1];
    let growth: number | null = 0;
    if (values.length > 1) {
      growth = first !== 0 ? ((last - first) / first) * 100 : last === 0 ? 0 : null;
    }

    return { total, average, max, min, growth };
  };

  // Le widget est-il monétaire ? Sinon on n'affiche pas « MAD » sur des comptes / % / niveaux de stock.
  const MONEY_RE = /revenu|revenue|chiffre|\bca\b|cout|co[uû]t|cost|montant|commission|prix|price|finance|portefeuille|valeur/i;
  const isMonetary = MONEY_RE.test(
    `${widget?.id ?? ''} ${(widget as { dataSource?: string })?.dataSource ?? ''} ${widget?.title ?? ''}`,
  );
  const fmtStat = (n: number) => (isMonetary ? formatCurrency(n) : formatNumber(n));

  // Fonction pour rendre un graphique en barres simple
  const renderBarChart = () => {
    if (!data || data.length === 0) return null;

    const maxValue = Math.max(...data.map(item => item.value || item.CA || 0));
    const height = widgetSize === 'small' ? 60 : widgetSize === 'large' ? 120 : 80;

    return (
      <div className="flex items-end justify-between h-20 space-x-1">
        {data.slice(0, 6).map((item, index) => {
          const value = item.value || item.CA || 0;
          const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
          
          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div 
                className="bg-orange-500 rounded-t w-full transition-all duration-300 hover:bg-orange-600"
                style={{ height: `${(percentage / 100) * height}px` }}
              />
              <div className="text-xs text-gray-600 mt-1 truncate w-full text-center">
                {item.name}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Fonction pour rendre un graphique circulaire simple
  const renderPieChart = () => {
    if (!data || data.length === 0) return null;

    const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
    const colors = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    return (
      <div className="flex items-center justify-center">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 transform -rotate-90">
            {data.slice(0, 6).map((item, index) => {
              const value = item.value || 0;
              const percentage = total > 0 ? (value / total) * 100 : 0;
              const circumference = 2 * Math.PI * 24; // rayon = 24
              const strokeDasharray = circumference;
              const strokeDashoffset = circumference - (percentage / 100) * circumference;
              const previousPercentages = data
                .slice(0, index)
                .reduce((sum, prevItem) => sum + ((prevItem.value || 0) / total) * 100, 0);
              const rotation = (previousPercentages / 100) * 360;

              return (
                <circle
                  key={index}
                  cx="32"
                  cy="32"
                  r="24"
                  stroke={colors[index % colors.length]}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: 'center'
                  }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-900">
              {data.length}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Fonction pour rendre un graphique linéaire simple
  const renderLineChart = () => {
    if (!data || data.length === 0) return null;

    const values = data.map(item => item.value || item.CA || 0);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue;
    const height = widgetSize === 'small' ? 60 : widgetSize === 'large' ? 120 : 80;

    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = range > 0 ? 100 - ((value - minValue) / range) * 100 : 50;
      return `${x}% ${y}%`;
    }).join(', ');

    return (
      <div className="relative h-20">
        <svg className="w-full h-full">
          <polyline
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            points={points}
          />
          {values.map((value, index) => {
            const x = (index / (values.length - 1)) * 100;
            const y = range > 0 ? 100 - ((value - minValue) / range) * 100 : 50;
            
            return (
              <circle
                key={index}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill="#f97316"
                className="hover:r-4 transition-all duration-200"
              />
            );
          })}
        </svg>
      </div>
    );
  };

  // Fonction pour déterminer le type de graphique
  const getChartType = () => {
    if (widget.id.includes('evolution') || widget.id.includes('trend')) {
      return 'line';
    }
    if (widget.id.includes('distribution') || widget.id.includes('pie')) {
      return 'pie';
    }
    return 'bar';
  };

  // Fonction pour rendre le graphique approprié
  const renderChart = () => {
    const chartType = getChartType();

    switch (chartType) {
      case 'line':
        return renderLineChart();
      case 'pie':
        return renderPieChart();
      default:
        return renderBarChart();
    }
  };

  // Fonction pour rendre les données du graphique
  const renderChartData = () => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center text-gray-500 py-4">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">Aucune donnée disponible</div>
        </div>
      );
    }

    const stats = calculateStats();
    const chartType = getChartType();

    return (
      <div className="space-y-3">
        {/* Contrôles de période pour les graphiques d'évolution */}
        {(widget.id.includes('evolution') || widget.id.includes('trend')) && (
          <div className="flex space-x-1">
            <button
              onClick={() => setSelectedPeriod('week')}
              className={`px-2 py-1 text-xs rounded ${
                selectedPeriod === 'week'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-2 py-1 text-xs rounded ${
                selectedPeriod === 'month'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Mois
            </button>
            <button
              onClick={() => setSelectedPeriod('quarter')}
              className={`px-2 py-1 text-xs rounded ${
                selectedPeriod === 'quarter'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Trimestre
            </button>
          </div>
        )}

        {/* Graphique */}
        <div className="flex items-center justify-center">
          {renderChart()}
        </div>

        {/* Statistiques */}
        {stats && (
          <div className={`grid ${getAdaptiveSize('grid')} gap-2 text-xs`}>
            <div className="text-center p-2 bg-orange-50 rounded">
              <div className="font-semibold text-orange-600">
                {fmtStat(stats.total)}
              </div>
              <div className="text-orange-700">Total</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="font-semibold text-gray-900">
                {fmtStat(stats.average)}
              </div>
              <div className="text-gray-600">Moyenne</div>
            </div>
            {stats.growth !== undefined && (
              <div className="text-center p-2 bg-gray-50 rounded">
                {stats.growth === null ? (
                  <div className="font-semibold text-gray-400">n/d</div>
                ) : (
                  <div className={`font-semibold flex items-center justify-center ${
                    stats.growth >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stats.growth >= 0 ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {stats.growth >= 0 ? '+' : ''}{stats.growth.toFixed(1)}%
                  </div>
                )}
                <div className="text-gray-600">Évolution</div>
              </div>
            )}
          </div>
        )}

        {/* Légende pour les graphiques circulaires */}
        {chartType === 'pie' && (
          <div className="space-y-1">
            {data.slice(0, 6).map((item, index) => {
              const colors = ['#f97316', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
              return (
                <div key={index} className="flex items-center text-xs">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  <span className="text-gray-600">{item.name}</span>
                  <span className="ml-auto font-medium">
                    {formatNumber(item.value || 0)}
                  </span>
                </div>
              );
            })}
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
  };

  return (
    <div className="space-y-2">
      {renderChartData()}

      {/* Modal de détails */}
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">{widget.title}</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Graphique agrandi */}
              <div className="h-64 flex items-center justify-center">
                {renderChart()}
              </div>

              {/* Données détaillées */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Données Détaillées</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Nom</th>
                        <th className="text-right py-2">Valeur</th>
                        <th className="text-right py-2">Pourcentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((item, index) => {
                        const value = item.value || item.CA || 0;
                        const total = data.reduce((sum, d) => sum + (d.value || d.CA || 0), 0);
                        const percentage = total > 0 ? (value / total) * 100 : 0;
                        
                        return (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="py-2">{item.name}</td>
                            <td className="text-right py-2 font-medium">
                              {fmtStat(value)}
                            </td>
                            <td className="text-right py-2 text-gray-600">
                              {percentage.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Actions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button className="px-4 py-2 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors">
                    Exporter données
                  </button>
                  <button className="px-4 py-2 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors">
                    Générer rapport
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

export default ChartWidget; 