import React from 'react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const PerformanceScoreWidget = ({ data }: { data: any }) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
      default: return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      case 'stable': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Score de Performance Commerciale</h3>
          <p className="text-sm text-gray-600">Votre performance globale sur 100 points</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreBgColor(data.score)} ${getScoreColor(data.score)}`}>
          Rang {data.rank}/{data.totalVendors}
        </div>
      </div>

      {/* Score Principal */}
      <div className="text-center mb-6">
        <div className="relative inline-block">
          {/* Jauge circulaire */}
          <div className="w-32 h-32 mx-auto relative">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
              {/* Cercle de fond */}
              <circle
                cx="60"
                cy="60"
                r="54"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-gray-200"
              />
              {/* Cercle de progression */}
              <circle
                cx="60"
                cy="60"
                r="54"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${(data.score / 100) * 339.292} 339.292`}
                strokeLinecap="round"
                className={`${getScoreBarColor(data.score)} transition-all duration-1000`}
              />
            </svg>
            {/* Score au centre */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div>
                <div className={`text-3xl font-bold ${getScoreColor(data.score)}`}>
                  {data.score}
                </div>
                <div className="text-sm text-gray-500">/ 100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Objectif */}
        <div className="mt-4">
          <div className="text-sm text-gray-600">Objectif mensuel</div>
          <div className="text-lg font-semibold text-gray-900">{data.target}/100</div>
          <div className="text-sm text-gray-500">
            {data.score >= data.target ? '✅ Objectif atteint' : `${data.target - data.score} points à gagner`}
          </div>
        </div>
      </div>

      {/* Métriques détaillées */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Ventes</span>
            <span className={`text-sm font-medium ${getTrendColor(data.trends.sales)}`}>
              {getTrendIcon(data.trends.sales)}
            </span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(data.sales)}
          </div>
          <div className="text-xs text-gray-500">
            {Math.round((data.sales / data.salesTarget) * 100)}% de l'objectif
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Croissance</span>
            <span className={`text-sm font-medium ${getTrendColor(data.trends.growth)}`}>
              {getTrendIcon(data.trends.growth)}
            </span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            +{data.growth}%
          </div>
          <div className="text-xs text-gray-500">
            Objectif: +{data.growthTarget}%
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Prospects</span>
            <span className={`text-sm font-medium ${getTrendColor(data.trends.prospects)}`}>
              {getTrendIcon(data.trends.prospects)}
            </span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {data.activeProspects}/{data.prospects}
          </div>
          <div className="text-xs text-gray-500">
            Actifs
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Réactivité</span>
            <span className={`text-sm font-medium ${getTrendColor(data.trends.responseTime)}`}>
              {getTrendIcon(data.trends.responseTime)}
            </span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {data.responseTime}h
          </div>
          <div className="text-xs text-gray-500">
            Objectif: {data.responseTarget}h
          </div>
        </div>
      </div>

      {/* Recommandations IA */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
          <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
          Recommandations IA pour améliorer votre score
        </h4>
        <div className="space-y-2">
          {data.recommendations.map((rec: any, index: number) => (
            <div key={index} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <div className={`w-2 h-2 rounded-full mt-2 ${
                rec.priority === 'high' ? 'bg-red-500' :
                rec.priority === 'medium' ? 'bg-orange-500' : 'bg-blue-500'
              }`}></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{rec.action}</div>
                <div className="text-xs text-gray-500">Impact: {rec.impact}</div>
              </div>
              <button className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 transition-colors">
                Agir
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Barre de progression vers l'objectif */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Progression vers l'objectif</span>
          <span className="font-medium text-gray-900">{data.score}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-1000 ${getScoreBarColor(data.score)}`}
            style={{ width: `${data.score}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};
