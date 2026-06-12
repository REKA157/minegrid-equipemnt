import React from 'react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const SalesPerformanceScoreWidget = ({ data }: { data: any }) => {
  const { formatCurrency } = useWidgetMadCurrency();
  // Utiliser des valeurs par défaut intelligentes même si data est null/undefined
  const safeData = {
    score: data?.score || 0,
    target: data?.target || 85,
    rank: data?.rank || 1,
    totalVendors: data?.totalVendors || 1,
    sales: data?.sales || 0,
    salesTarget: data?.salesTarget || 3000000,
    growth: data?.growth || 0,
    growthTarget: data?.growthTarget || 15,
    prospects: data?.prospects || 0,
    activeProspects: data?.activeProspects || 0,
    responseTime: data?.responseTime || 2.5,
    responseTarget: data?.responseTarget || 1.5,
    activityLevel: data?.activityLevel || 'modéré',
    activityRecommendation: data?.activityRecommendation || 'Analyser les opportunités d\'amélioration',
    recommendations: data?.recommendations || [
      {
        id: 1,
        title: 'Commencer à collecter des données',
        description: 'Ajoutez vos premières ventes et prospects pour obtenir des recommandations personnalisées',
        priority: 'high',
        category: 'data'
      },
      {
        id: 2,
        title: 'Définir vos objectifs',
        description: 'Configurez vos objectifs de vente pour mesurer votre progression',
        priority: 'medium',
        category: 'goals'
      },
      {
        id: 3,
        title: 'Optimiser votre processus',
        description: 'Améliorez votre temps de réponse aux prospects',
        priority: 'low',
        category: 'process'
      }
    ],
    trends: data?.trends || {
      sales: 'stable',
      growth: 'stable',
      prospects: 'stable',
      responseTime: 'stable'
    },
    metrics: data?.metrics || {
      sales: { value: 0, target: 3000000, trend: 'stable' },
      growth: { value: 0, target: 15, trend: 'stable' },
      prospects: { value: 0, target: 10, trend: 'stable' },
      responseTime: { value: 2.5, target: 1.5, trend: 'stable' }
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-orange-600';
    if (score >= 60) return 'text-orange-500';
    return 'text-orange-400';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-orange-500';
    if (score >= 60) return 'bg-orange-400';
    return 'bg-orange-300';
  };

  const getActivityLevelColor = (level: string) => {
    switch (level) {
      case 'élevé': return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30';
      case 'modéré': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      case 'faible': return 'text-orange-500 bg-orange-50 dark:bg-orange-900/10';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-700';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      case 'stable': return '→';
      default: return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-orange-600';
      case 'down': return 'text-orange-400';
      case 'stable': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30';
      case 'medium': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      case 'low': return 'text-orange-500 bg-orange-50 dark:bg-orange-900/10';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-700';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      {/* En-tête avec score principal */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Score de Performance Commerciale</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Votre performance globale avec recommandations IA</p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${getScoreColor(safeData.score)}`}>
            {safeData.score}/100
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Objectif: {safeData.target}/100
          </div>
        </div>
      </div>

      {/* Jauge circulaire animée */}
      <div className="flex justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
            {/* Cercle de fond */}
            <circle
              cx="60"
              cy="60"
              r="54"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-gray-200 dark:text-gray-700"
            />
            {/* Cercle de progression */}
            <circle
              cx="60"
              cy="60"
              r="54"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${2 * Math.PI * 54 * (1 - safeData.score / 100)}`}
              className={`${getScoreBarColor(safeData.score)} transition-all duration-1000 ease-out`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getScoreColor(safeData.score)}`}>
                {safeData.score}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">/100</div>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de progression vers l'objectif */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600 dark:text-gray-400">Progression vers l'objectif</span>
          <span className="text-gray-600 dark:text-gray-400">{Math.round((safeData.score / safeData.target) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${getScoreBarColor(safeData.score)}`}
            style={{ width: `${Math.min((safeData.score / safeData.target) * 100, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Rang anonymisé */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
            Rang parmi les vendeurs (anonymisé)
          </span>
          <span className="text-lg font-bold text-orange-900 dark:text-orange-100">
            {safeData.rank}/{safeData.totalVendors}
          </span>
        </div>
      </div>

      {/* Niveau d'activité recommandé */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
              Niveau d'activité recommandé
            </span>
            <div className="text-sm text-orange-700 dark:text-orange-300">
              {safeData.activityRecommendation}
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getActivityLevelColor(safeData.activityLevel)}`}>
            {safeData.activityLevel}
          </div>
        </div>
      </div>

      {/* Métriques détaillées */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-orange-700 dark:text-orange-300">Ventes</span>
                      <span className={`text-sm ${getTrendColor(safeData.trends.sales)}`}>
            {getTrendIcon(safeData.trends.sales)}
          </span>
        </div>
        <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">
          {formatCurrency(safeData.sales)}
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400">
          Objectif: {formatCurrency(safeData.salesTarget)}
        </div>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-orange-700 dark:text-orange-300">Croissance</span>
                      <span className={`text-sm ${getTrendColor(safeData.trends.growth)}`}>
            {getTrendIcon(safeData.trends.growth)}
          </span>
        </div>
        <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">
          {safeData.growth}%
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400">
          Objectif: {safeData.growthTarget}%
        </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-orange-700 dark:text-orange-300">Prospects</span>
                      <span className={`text-sm ${getTrendColor(safeData.trends.prospects)}`}>
            {getTrendIcon(safeData.trends.prospects)}
          </span>
        </div>
        <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">
          {safeData.prospects}
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400">
          Actifs: {safeData.activeProspects}
        </div>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-orange-700 dark:text-orange-300">Réactivité</span>
                      <span className={`text-sm ${getTrendColor(safeData.trends.responseTime)}`}>
            {getTrendIcon(safeData.trends.responseTime)}
          </span>
        </div>
        <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">
          {safeData.responseTime === 0 ? 'Aucune donnée' : `${safeData.responseTime}h`}
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400">
          Objectif: {safeData.responseTarget}h
        </div>
        </div>
      </div>

      {/* Recommandations IA concrètes */}
      <div>
        <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-3">Recommandations IA concrètes</h4>
        <div className="space-y-3">
          {safeData.recommendations.map((rec: any, index: number) => (
            <div key={index} className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                {rec.priority === 'high' ? '🔥' : rec.priority === 'medium' ? '⚡' : '💡'}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  {rec.action}
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mb-1">
                  {rec.description}
                </div>
                <div className="text-xs text-orange-500 dark:text-orange-300">
                  Impact: {rec.impact}
                </div>
              </div>
              <button className="px-3 py-1 bg-orange-500 text-white text-xs rounded-full hover:bg-orange-600 transition-colors">
                Agir
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
