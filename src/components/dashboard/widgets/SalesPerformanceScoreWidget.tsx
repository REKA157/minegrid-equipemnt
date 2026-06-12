import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { getSalesPerformanceData } from '../../../utils/api';
import { apiCall, showNotification } from '../../../services/apiService';
import { supabaseClient } from '../../../utils/supabaseClient';
import { aiWidgetService } from '../../../services/aiWidgetService';
import type { AIRecommendation } from '../../../services/aiWidgetService';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

interface SalesPerformanceScoreData {
  score: number;
  target: number;
  rank: number;
  totalVendors: number;
  sales: number;
  salesTarget: number;
  growth: number;
  growthTarget: number;
  prospects: number;
  activeProspects: number;
  responseTime: number;
  responseTarget: number;
  activityLevel?: string;
  activityRecommendation?: string;
  recommendations: Array<{
    type?: string;
    action: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  trends: {
    sales: string;
    growth: string;
    prospects: string;
    responseTime: string;
  };
}

type PerformanceRecommendationRow = {
  type?: string;
  action: string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
  id?: string;
  /** Présent uniquement pour les lignes issues de aiWidgetService (monitor ou fallback local). */
  aiSource?: 'monitor' | 'local';
  suggestedActions?: string[];
};

function mapImpactToWidgetPriority(impact: AIRecommendation['impact']): 'high' | 'medium' | 'low' {
  if (impact === 'high') return 'high';
  if (impact === 'low') return 'low';
  return 'medium';
}

function mapAIRecommendationsToRows(
  items: AIRecommendation[],
  source: 'monitor' | 'local'
): PerformanceRecommendationRow[] {
  return items.map((r) => ({
    id: r.id,
    action: r.title,
    impact: r.description,
    priority: mapImpactToWidgetPriority(r.impact),
    aiSource: source,
    suggestedActions: r.actions,
  }));
}

// Score convergent : catalogue + pipeline + couverture annonces (voir getSalesPerformanceData)
// Toujours chargé via l’API — pas de données mock via props.
const SalesPerformanceScoreWidget = (_props?: { data?: unknown }) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const [realData, setRealData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aiRecommendationRows, setAiRecommendationRows] = useState<PerformanceRecommendationRow[]>([]);
  const [aiRecsLoading, setAiRecsLoading] = useState(false);

  const loadRealData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const performanceData = await getSalesPerformanceData();
      setRealData(performanceData);
    } catch (error) {
      console.error('Erreur lors du chargement des données de performance:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRealData();
  }, [loadRealData]);

  useEffect(() => {
    const onRefresh = () => {
      void loadRealData();
    };
    window.addEventListener('pipeline:refresh', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      window.removeEventListener('pipeline:refresh', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [loadRealData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: auth } = await supabaseClient.auth.getSession();
        const userId = auth.session?.user?.id;
        if (!userId) return;
        setAiRecsLoading(true);
        const { items, source } = await aiWidgetService.getAIRecommendationsWithSource(userId);
        if (cancelled) return;
        setAiRecommendationRows(mapAIRecommendationsToRows(items, source));
      } catch (e) {
        console.error('SalesPerformanceScoreWidget: chargement recommandations IA', e);
      } finally {
        if (!cancelled) setAiRecsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleRecommendationAction = (
    e: MouseEvent<HTMLButtonElement>,
    recommendation: PerformanceRecommendationRow
  ) => {
    if (!recommendation.aiSource) return;

    const button = e.currentTarget;
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';

    const sourceLabel = recommendation.aiSource === 'monitor' ? 'IA (serveur)' : 'IA (analyse locale)';
    showNotification('success', `${sourceLabel} — ${recommendation.action}`);

    setTimeout(() => {
      apiCall('POST', '/api/recommendations/execute', {
        recommendationId: recommendation.id,
        action: recommendation.action,
        aiSource: recommendation.aiSource,
        suggestedActions: recommendation.suggestedActions,
      }).catch((error) => {
        console.error('Erreur API recommandation:', error);
      });
    }, 50);

    setTimeout(() => {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    }, 400);
  };

  const [showQuickActions, setShowQuickActions] = useState(false);

  const staticRecommendationRows: PerformanceRecommendationRow[] = useMemo(
    () =>
      (realData?.recommendations || []).map(
        (rec: { type?: string; action: string; impact: string; priority: 'high' | 'medium' | 'low' }) => ({
          type: rec.type,
          action: rec.action,
          impact: rec.impact,
          priority: rec.priority,
        }),
      ),
    [realData],
  );

  const recommendationRows: PerformanceRecommendationRow[] = useMemo(() => {
    if (!aiRecommendationRows.length) return staticRecommendationRows;
    const tail = staticRecommendationRows.filter(
      (s) => !aiRecommendationRows.some((a) => a.action === s.action),
    );
    return [...aiRecommendationRows, ...tail].slice(0, 12);
  }, [aiRecommendationRows, staticRecommendationRows]);

  if (loadError && !realData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 text-center">
        <p className="text-red-700 text-sm mb-3">
          Impossible de charger le score commercial. Vérifiez votre connexion.
        </p>
        <button
          type="button"
          onClick={() => void loadRealData()}
          className="text-sm font-medium text-orange-700 hover:text-orange-900 underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!realData) {
    return (
      <div className="flex items-center justify-center p-8 bg-white rounded-lg border border-gray-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
        <span className="ml-2 text-gray-600">Chargement du score convergent…</span>
      </div>
    );
  }

  const displayData = realData;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Score de Performance Commerciale</h3>
          <p className="text-sm text-gray-600">
            {loading
              ? 'Actualisation des indicateurs…'
              : 'Indice convergent : catalogue, pipeline (leads) et couverture annonces — mis à jour avec le Kanban'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
          )}
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreBgColor(displayData.score)} ${getScoreColor(displayData.score)}`}>
            {displayData.totalVendors <= 1
              ? 'Votre compte'
              : `Rang ${displayData.rank}/${displayData.totalVendors}`}
          </div>
        </div>
      </div>

      {displayData.convergent && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5 text-left">
          <div className="rounded-lg border border-orange-100 bg-orange-50/70 p-3">
            <div className="text-xs font-semibold text-orange-900">Visibilité & contacts</div>
            <div className={`text-xl font-bold ${getScoreColor(Math.min(100, displayData.convergent.engagementScore * 2))}`}>
              {displayData.convergent.engagementScore}
              <span className="text-sm font-normal text-gray-500">/50</span>
            </div>
            <p className="text-[10px] text-gray-600 leading-snug mt-0.5">
              Vues, messages et offres par rapport au nombre d&apos;annonces — même logique que l&apos;activité catalogue.
            </p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
            <div className="text-xs font-semibold text-amber-900">Pipeline commercial</div>
            <div className={`text-xl font-bold ${getScoreColor(Math.min(100, displayData.convergent.pipelineScore * 3))}`}>
              {displayData.convergent.pipelineScore}
              <span className="text-sm font-normal text-gray-500">/30</span>
            </div>
            <p className="text-[10px] text-gray-600 leading-snug mt-0.5">
              {displayData.convergent.pipelineOpen} ouvert(s) · {displayData.convergent.pipelineWon} conclu(s) ·{' '}
              {displayData.convergent.staleOpenLeads > 0
                ? `${displayData.convergent.staleOpenLeads} sans contact 14j`
                : 'aucun relâchement détecté'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-800">Couverture stock</div>
            <div className={`text-xl font-bold ${getScoreColor(Math.min(100, displayData.convergent.stockCoverageScore * 5))}`}>
              {displayData.convergent.stockCoverageScore}
              <span className="text-sm font-normal text-gray-500">/20</span>
            </div>
            <p className="text-[10px] text-gray-600 leading-snug mt-0.5">
              Densité du catalogue vendeur — cohérent avec le widget Plan d&apos;action stock. Global Monitor :{' '}
              {displayData.convergent.monitorLinkedLeads} lead(s) lié(s) à un projet.
            </p>
          </div>
        </div>
      )}

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
                strokeDasharray={`${(displayData.score / 100) * 339.292} 339.292`}
                strokeLinecap="round"
                className={`${getScoreBarColor(displayData.score)} transition-all duration-1000`}
              />
            </svg>
            {/* Score au centre */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div>
                <div className={`text-3xl font-bold ${getScoreColor(displayData.score)}`}>{displayData.score}</div>
                <div className="text-sm text-gray-500">/ 100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Objectif */}
        <div className="mt-4">
          <div className="text-sm text-gray-600">Objectif mensuel</div>
          <div className="text-lg font-semibold text-gray-900">{displayData.target}/100</div>
          <div className="text-sm text-gray-500">
            {displayData.score >= displayData.target ? '✅ Objectif atteint' : `${displayData.target - displayData.score} points à gagner`}
          </div>
        </div>
      </div>

      {/* Métriques détaillées */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Ventes</span>
            <span className={`text-sm font-medium ${getTrendColor(displayData.trends.sales)}`}>{getTrendIcon(displayData.trends.sales)}</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">{formatCurrency(displayData.sales)}</div>
          <div className="text-xs text-gray-500">{Math.round((displayData.sales / displayData.salesTarget) * 100)}% de l'objectif</div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Croissance</span>
            <span className={`text-sm font-medium ${getTrendColor(displayData.trends.growth)}`}>{getTrendIcon(displayData.trends.growth)}</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">+{displayData.growth}%</div>
          <div className="text-xs text-gray-500">Objectif: +{displayData.growthTarget}%</div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Pipeline</span>
            <span className={`text-sm font-medium ${getTrendColor(displayData.trends.prospects)}`}>{getTrendIcon(displayData.trends.prospects)}</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">{displayData.activeProspects}/{displayData.prospects}</div>
          <div className="text-xs text-gray-500">Ouverts / total leads (Kanban)</div>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Réactivité</span>
            <span className={`text-sm font-medium ${getTrendColor(displayData.trends.responseTime)}`}>{getTrendIcon(displayData.trends.responseTime)}</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">{displayData.responseTime}h</div>
          <div className="text-xs text-gray-500">Objectif: {displayData.responseTarget}h</div>
        </div>
      </div>

      {/* Recommandations IA */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 bg-orange-500 rounded-full shrink-0"></span>
            <span>Recommandations — IA en tête, puis actions pipeline & catalogue</span>
            {aiRecsLoading && (
              <span className="text-xs font-normal text-gray-500">Chargement IA…</span>
            )}
            {!aiRecsLoading && aiRecommendationRows.length > 0 && (
              <span className="text-xs font-normal text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                {aiRecommendationRows[0]?.aiSource === 'monitor' ? 'Source : serveur' : 'Source : analyse locale'}
              </span>
            )}
          </h4>
          <button
            className="p-1 text-orange-500 hover:text-orange-700 transition-colors"
            onClick={() => setShowQuickActions((v) => !v)}
            title={showQuickActions ? 'Fermer' : 'Ouvrir'}
          >
            {showQuickActions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        {showQuickActions && (
          <div className="space-y-2">
            {recommendationRows.map((rec, index: number) => {
              const agirEnabled = Boolean(rec.aiSource);
              return (
                <div
                  key={rec.id ?? `${rec.action}-${index}`}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      rec.priority === 'high'
                        ? 'bg-red-500'
                        : rec.priority === 'medium'
                          ? 'bg-orange-500'
                          : 'bg-blue-500'
                    }`}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{rec.action}</div>
                    <div className="text-xs text-gray-500">Impact: {rec.impact}</div>
                  </div>
                  <button
                    type="button"
                    disabled={!agirEnabled}
                    title={
                      agirEnabled
                        ? 'Exécuter une action liée à cette recommandation IA'
                        : 'Connectez-vous et attendez les recommandations IA (serveur ou analyse locale)'
                    }
                    className={`text-xs shrink-0 px-2 py-1 rounded border transition-colors ${
                      agirEnabled
                        ? 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200 cursor-pointer'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-80'
                    }`}
                    onClick={(ev) => agirEnabled && handleRecommendationAction(ev, rec)}
                  >
                    Agir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barre de progression vers l'objectif */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">Progression vers l'objectif</span>
          <span className="font-medium text-gray-900">{displayData.score}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all duration-1000 ${getScoreBarColor(displayData.score)}`} style={{ width: `${displayData.score}%` }}></div>
        </div>
      </div>
    </div>
  );
};

export default SalesPerformanceScoreWidget; 