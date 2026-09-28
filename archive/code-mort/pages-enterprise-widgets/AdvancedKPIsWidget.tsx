import React, { useState } from 'react';
import { Activity, BarChart3, TrendingUp } from 'lucide-react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const AdvancedKPIsWidget = ({ data }: { data: any }) => {
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [showTargets, setShowTargets] = useState<boolean>(false);
  const { madToDisplay, currentCurrency } = useWidgetMadCurrency();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'good':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'improving':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingUp className="h-4 w-4 text-red-600 transform rotate-180" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getProgressColor = (value: number, target: number) => {
    const ratio = value / target;
    if (ratio >= 1) return 'bg-green-500';
    if (ratio >= 0.8) return 'bg-yellow-500';
    if (ratio >= 0.6) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === '%') return `${value.toFixed(1)}%`;
    if (unit === '/5') return `${value.toFixed(1)}/5`;
    if (unit === 'MAD/h') return `${madToDisplay(value).toFixed(0)} ${currentCurrency}/h`;
    if (unit === 'jours') return `${value.toFixed(1)} jours`;
    if (unit === 'heures') return `${value.toFixed(1)}h`;
    if (unit === 'fois/an') return `${value.toFixed(1)}x/an`;
    if (unit === '% du CA') return `${value.toFixed(1)}%`;
    return `${value.toFixed(1)} ${unit}`;
  };

  const filteredMetrics = selectedMetric === 'all'
    ? data.metrics
    : data.metrics.filter((metric: any) => metric.status === selectedMetric);

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <BarChart3 className="h-6 w-6 text-orange-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">{data.title}</h3>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">Tous</option>
            <option value="excellent">Excellent</option>
            <option value="good">Bon</option>
            <option value="improving">En amélioration</option>
            <option value="warning">Attention</option>
            <option value="critical">Critique</option>
          </select>
          <button
            onClick={() => setShowTargets(!showTargets)}
            className={`text-sm px-2 py-1 rounded ${showTargets ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'}`}
          >
            {showTargets ? 'Masquer' : 'Afficher'} objectifs
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {filteredMetrics.map((metric: any, index: number) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                {getTrendIcon(metric.trend)}
                <h4 className="font-medium text-gray-900 ml-2">{metric.name}</h4>
              </div>
              <div className={`text-sm px-2 py-1 rounded-full border ${getStatusColor(metric.status)}`}>
                {metric.status === 'excellent' ? 'Excellent' :
                 metric.status === 'good' ? 'Bon' :
                 metric.status === 'improving' ? 'En amélioration' :
                 metric.status === 'warning' ? 'Attention' :
                 metric.status === 'critical' ? 'Critique' : 'Normal'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatValue(metric.value, metric.unit)}
                </div>
                <div className="text-sm text-gray-600">Valeur actuelle</div>
              </div>
              {showTargets && (
                <div>
                  <div className="text-lg font-semibold text-gray-700">
                    {formatValue(metric.target, metric.unit)}
                  </div>
                  <div className="text-sm text-gray-600">Objectif</div>
                </div>
              )}
            </div>

            {/* Barre de progression */}
            {showTargets && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Progression</span>
                  <span>{((metric.value / metric.target) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(metric.value, metric.target)}`}
                    style={{ width: `${Math.min((metric.value / metric.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Évolution */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={`text-sm font-medium ${
                  metric.change > 0 ? 'text-green-600' :
                  metric.change < 0 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {metric.change > 0 ? '+' : ''}{metric.change > 0 ? metric.change : Math.abs(metric.change)}
                </span>
                <span className="text-xs text-gray-500">
                  vs période précédente
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button className="text-orange-600 hover:text-orange-700 text-xs font-medium">
                  Détails
                </button>
                <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                  Actions
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredMetrics.length === 0 && (
        <div className="text-center py-8">
          <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">Aucun KPI trouvé</p>
        </div>
      )}
    </div>
  );
};
