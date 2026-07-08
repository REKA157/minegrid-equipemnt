import React, { useState, useEffect, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { notificationService, exportService } from '../services';
import { supabaseClient } from '../utils/supabaseClient';
import { getSalesEvolutionSeriesData } from '../utils/api';
import { madToDisplayAmount, formatDisplayMoney, formatMadMoney } from '../utils/madMoneyDisplay';
import { useCurrencyStore } from '../stores/currencyStore';
import { aiWidgetService } from '../services/aiWidgetService';
import type { AIPrediction, AISalesBenchmark, AIRecommendation } from '../services/aiWidgetService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface SalesData {
  month: string;
  sales: number;
  target: number;
  previousYear: number;
  offers: number;
}

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  action?: string;
  /** Lien réel vers l'action (anti-façade : pas d'action non branchée). */
  href?: string;
}

interface AISuggestion {
  id: string;
  type: 'optimization' | 'alert' | 'opportunity';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

interface BenchmarkData {
  sector: string;
  average: number;
  top25: number;
  yourPerformance: number;
  source?: 'monitor' | 'local';
  note?: string;
}

interface Props {
  /** Réservé compat ; les données viennent de l’API (getSalesEvolutionSeriesData). */
  data?: unknown;
  /** Taille de la carte hôte -> adapte hauteur du graphe et densité (ergonomie). */
  widgetSize?: 'small' | 'medium' | 'large';
}

const SalesEvolutionWidgetEnriched: React.FC<Props> = ({ widgetSize = 'medium' }) => {
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'sales' | 'target' | 'previousYear'>('sales');
  const [showDetails, setShowDetails] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiSuggestionsSource, setAiSuggestionsSource] = useState<'monitor' | 'local' | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [forecastPredictions, setForecastPredictions] = useState<AIPrediction[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastSource, setForecastSource] = useState<'monitor' | 'local' | null>(null);
  const [benchmarkModalLoading, setBenchmarkModalLoading] = useState(false);
  const [benchmarkModalData, setBenchmarkModalData] = useState<AISalesBenchmark | null>(null);
  const [benchmarkModalSource, setBenchmarkModalSource] = useState<'monitor' | 'local' | null>(null);

  const { currentCurrency, rates } = useCurrencyStore();

  // EXPLICATION DES CAUSES + ACTIONS RÉELLES (remplace les pourcentages nus). Chaque
  // message s'appuie sur des chiffres RÉELS du mois (CA conclu, nb d'offres, écart cible,
  // vs an dernier) et propose une action BRANCHÉE (#leads). Anti-façade : pas d'action vide.
  const generateNotifications = (rows: SalesData[]) => {
    const cur = rows[rows.length - 1];
    if (!cur) {
      setNotifications([]);
      return;
    }
    const out: Notification[] = [];
    const money = (v: number) => formatMadMoney(v, currentCurrency, rates);

    // Cause : objectif non atteint -> expliquer (CA conclu vs cible + activité offres).
    if (cur.target > 0 && cur.sales < cur.target * 0.85) {
      const achievedPct = Math.round((cur.sales / cur.target) * 100);
      const cause =
        cur.offers > 0
          ? `${cur.offers} offre(s) envoyée(s) mais peu de ventes conclues.`
          : 'Aucune offre envoyée ce mois.';
      out.push({
        id: 'below-target',
        type: 'warning',
        message: `Objectif atteint à ${achievedPct} % : ${money(cur.sales)} conclus sur ${money(cur.target)} visés. ${cause}`,
        action: 'Relancer mes leads',
        href: '#leads',
      });
    }

    // Cause : des offres mais zéro vente conclue -> convertir.
    if (cur.sales === 0 && cur.offers > 0) {
      out.push({
        id: 'offers-no-sale',
        type: 'info',
        message: `${cur.offers} offre(s) en attente, aucune vente conclue ce mois : convertir vos offres en dossiers.`,
        action: 'Voir le pipeline',
        href: '#leads',
      });
    }

    // Cause : croissance vs an dernier -> capitaliser.
    if (cur.previousYear > 0 && cur.sales > cur.previousYear * 1.2) {
      const growth = Math.round(((cur.sales - cur.previousYear) / cur.previousYear) * 100);
      out.push({
        id: 'growth',
        type: 'success',
        message: `+${growth}% vs l'an dernier (${money(cur.sales)} contre ${money(cur.previousYear)}) : capitaliser sur cette dynamique.`,
        action: 'Pousser mes opportunités',
        href: '#leads',
      });
    }

    setNotifications(out);
  };

  // Suggestions RÉELLES : recommandations IA serveur (monitor) ou, à défaut,
  // analyse locale calculée sur les vraies annonces du vendeur. Le bloc reste
  // masqué s'il n'y a aucune recommandation (anti-façade : plus de texte codé en dur).
  const recommendationType = (c: AIRecommendation['category']): AISuggestion['type'] => {
    if (c === 'marketing' || c === 'inventory') return 'optimization';
    if (c === 'performance') return 'alert';
    return 'opportunity';
  };

  const loadAISuggestions = React.useCallback(async () => {
    try {
      const { data: auth } = await supabaseClient.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId) {
        setAiSuggestions([]);
        setAiSuggestionsSource(null);
        return;
      }
      const { items, source } = await aiWidgetService.getAIRecommendationsWithSource(userId);
      const mapped: AISuggestion[] = items.slice(0, 4).map((r) => ({
        id: r.id,
        type: recommendationType(r.category),
        title: r.title,
        description: r.description,
        impact: r.impact,
      }));
      setAiSuggestions(mapped);
      setAiSuggestionsSource(mapped.length ? source : null);
    } catch {
      setAiSuggestions([]);
      setAiSuggestionsSource(null);
    }
  }, []);

  const loadSalesData = React.useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getSalesEvolutionSeriesData(6);
      const normalized: SalesData[] = rows.map((r) => ({
        month: r.month,
        sales: r.sales,
        target: r.target,
        previousYear: r.previousYear,
        offers: r.offers ?? 0,
      }));
      setSalesData(normalized);
      generateNotifications(normalized);
      // Anti-façade : AUCUN benchmark fabriqué à partir de ses propres chiffres. Le
      // benchmark secteur réel s'obtient à la demande (bouton « Benchmark secteur » -> serveur).
    } catch (error) {
      console.error('Erreur lors du chargement des données de vente:', error);
      notificationService.error('Erreur de chargement', 'Impossible de charger l’évolution des ventes');
      setSalesData([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSalesData();
  }, [loadSalesData]);

  useEffect(() => {
    void loadAISuggestions();
  }, [loadAISuggestions]);

  useEffect(() => {
    const onRefresh = () => {
      void loadSalesData();
      void loadAISuggestions();
    };
    window.addEventListener('pipeline:refresh', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      window.removeEventListener('pipeline:refresh', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [loadSalesData]);

  const chartData = useMemo(() => {
    const toD = (mad: number) => madToDisplayAmount(mad, currentCurrency, rates);
    // PALETTE SOBRE : un seul accent (l'orange de la marque) + des gris. La
    // performance vs objectif est portée par la carte KPI, pas par 3 couleurs.
    const ACCENT = '#EA580C'; // orange-600 (marque)
    return {
      labels: salesData.map((d) => d.month),
      datasets: [
        {
          label: 'Ventes',
          data: salesData.map((d) => toD(d.sales)),
          borderColor: ACCENT,
          backgroundColor: 'rgba(234, 88, 12, 0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: ACCENT,
          pointBorderWidth: 2,
          pointHoverRadius: 5,
          order: 1,
        },
        {
          label: 'Objectif',
          data: salesData.map((d) => toD(d.target)),
          borderColor: '#9CA3AF', // gris moyen : ligne de repère discrète
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [3, 3],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 2,
        },
        {
          label: 'Année précédente',
          data: salesData.map((d) => toD(d.previousYear)),
          borderColor: '#D1D5DB', // gris clair : contexte secondaire
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 3,
        },
      ],
    };
  }, [salesData, currentCurrency, rates]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            usePointStyle: true,
            pointStyle: 'circle' as const,
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,
            font: { size: 11 },
            color: '#6B7280',
            // Pastilles PLEINES à la couleur de la courbe (au lieu d'anneaux creux
            // hérités du remplissage blanc des points sur la courbe).
            generateLabels: (chart: {
              data: { datasets: Array<{ label?: string; borderColor?: unknown }> };
              isDatasetVisible: (i: number) => boolean;
            }) =>
              chart.data.datasets.map((ds, i) => ({
                text: ds.label ?? '',
                fillStyle: ds.borderColor as string,
                strokeStyle: ds.borderColor as string,
                lineWidth: 0,
                pointStyle: 'circle' as const,
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i,
              })),
          },
        },
        title: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.92)',
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          usePointStyle: true,
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) =>
              ` ${ctx.dataset.label}: ${formatDisplayMoney(ctx.parsed.y, currentCurrency)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: 'rgba(0, 0, 0, 0.05)', drawTicks: false },
          ticks: {
            font: { size: 11 },
            color: '#9CA3AF',
            padding: 8,
            maxTicksLimit: 5,
            callback: (value: string | number) => {
              const n = typeof value === 'number' ? value : Number(value);
              return formatDisplayMoney(Number.isFinite(n) ? n : 0, currentCurrency);
            },
          },
        },
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#9CA3AF' },
        },
      },
    }),
    [currentCurrency],
  );

  const handleQuickAction = (e: MouseEvent<HTMLButtonElement>, action: string) => {
    const button = e.currentTarget;
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';

    switch (action) {
      case 'ai_forecast':
        handleAIForecast();
        break;
      case 'export_data':
        handleExportData();
        break;
      default:
        notificationService.warning('Action non reconnue', `L'action "${action}" n'est pas implémentée`);
    }

    setTimeout(() => {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    }, 280);
  };

  const formatPredictionMetricValue = (metric: string, value: number) => {
    if (/conversion/i.test(metric)) {
      return `${Math.round(value)} %`;
    }
    return formatMadMoney(value, currentCurrency, rates);
  };

  const trendLabel = (t: AIPrediction['trend']) => {
    if (t === 'up') return 'Hausse';
    if (t === 'down') return 'Baisse';
    return 'Stable';
  };

  const timeframeLabel = (tf: AIPrediction['timeframe']) => {
    if (tf === '7d') return '7 jours';
    if (tf === '90d') return '90 jours';
    return '30 jours';
  };

  const formatBenchmarkMoney = (value: number) =>
    formatMadMoney(value, currentCurrency, rates);

  const openBenchmarkModal = () => {
    setShowBenchmark(true);
    setBenchmarkModalLoading(true);

    void (async () => {
      try {
        const { data: auth } = await supabaseClient.auth.getSession();
        const userId = auth.session?.user?.id;
        if (!userId) {
          notificationService.warning(
            'Benchmark secteur',
            'Connectez-vous pour charger les indicateurs depuis le serveur ou l’analyse locale.'
          );
          setBenchmarkModalLoading(false);
          return;
        }

        const { data, source } = await aiWidgetService.getSalesBenchmarkWithSource(userId);
        setBenchmarkModalData(data);
        setBenchmarkModalSource(data ? source : null);
        if (data) {
          setBenchmarkData((prev) =>
            prev
              ? {
                  ...prev,
                  sector: data.sector,
                  average: data.average,
                  top25: data.top25,
                  yourPerformance: data.yourPerformance,
                  source,
                  note: data.note,
                }
              : prev,
          );
        }
      } catch (e) {
        console.error('Benchmark secteur:', e);
        notificationService.error('Benchmark', 'Impossible de charger les données.');
      } finally {
        setBenchmarkModalLoading(false);
      }
    })();
  };

  const handleAIForecast = () => {
    notificationService.aiProcessing();
    setShowForecast(true);
    setForecastLoading(true);
    setForecastPredictions([]);
    setForecastSource(null);

    void (async () => {
      try {
        const { data: auth } = await supabaseClient.auth.getSession();
        const userId = auth.session?.user?.id;
        if (!userId) {
          notificationService.warning(
            'Prévision IA',
            'Connectez-vous pour obtenir des prévisions liées à votre activité.'
          );
          notificationService.aiCompleted();
          return;
        }

        const { items, source } = await aiWidgetService.getSalesPredictionsWithSource(userId);
        setForecastPredictions(items);
        setForecastSource(source);
        notificationService.aiCompleted();
        if (items.length === 0) {
          notificationService.info('Prévision IA', 'Aucune prévision renvoyée pour le moment.');
        }
      } catch (error) {
        console.error('Erreur lors de la prévision IA:', error);
        notificationService.error('Erreur IA', 'Impossible de charger les prévisions.');
        notificationService.aiCompleted();
      } finally {
        setForecastLoading(false);
      }
    })();
  };

  const handleExportData = () => {
    try {
      // Action immédiate
      notificationService.info('Export en cours', 'Génération du rapport...');
      
      const exportData = {
        displayCurrency: currentCurrency,
        monthlyData: salesData.map((month) => {
          const salesD = madToDisplayAmount(month.sales, currentCurrency, rates);
          const targetD = madToDisplayAmount(month.target, currentCurrency, rates);
          return {
            month: month.month,
            sales: salesD,
            target: targetD,
            gap: targetD - salesD,
            achievementRate:
              month.target > 0 ? Math.round((month.sales / month.target) * 100) : 0,
          };
        }),
      };
      
      // Export immédiat (sans await)
      exportService.exportSalesEvolution(exportData, { format: 'pdf' }).then(result => {
        if (result.success) {
          notificationService.success('Export réussi', `Rapport téléchargé: ${result.filename}`);
        } else {
          notificationService.error('Erreur d\'export', result.error || 'Erreur inconnue');
        }
      }).catch(error => {
        console.error('Erreur export:', error);
        notificationService.error('Erreur d\'export', 'Impossible d\'exporter les données');
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      notificationService.error('Erreur d\'export', 'Impossible d\'exporter les données');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const lastRow = salesData[salesData.length - 1];
  const noSales = salesData.length > 0 && salesData.every((d) => (d.sales || 0) === 0);

  // Récapitulatif RÉEL pour « Analyse complète » (données déjà chargées).
  const money = (v: number) => formatMadMoney(v, currentCurrency, rates);
  const totalSales = salesData.reduce((s, d) => s + d.sales, 0);
  const totalTarget = salesData.reduce((s, d) => s + d.target, 0);
  const overallPct = totalTarget > 0 ? Math.round((totalSales / totalTarget) * 100) : 0;
  const totalOffers = salesData.reduce((s, d) => s + d.offers, 0);
  const bestMonth = salesData.reduce<SalesData | null>(
    (b, d) => (b == null || d.sales > b.sales ? d : b),
    null,
  );

  return (
    // Chrome allégé : la carte hôte (shell) fournit déjà bordure + fond + padding.
    <div className="bg-white rounded-lg p-4">
      {/* Fine rangée : période + sélecteur (le TITRE vit dans la barre de la carte). */}
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <p
          className="text-xs text-gray-500 min-w-0"
          title={`6 derniers mois — agrégat pipeline + offres (réf. ${formatMadMoney(50000, currentCurrency, rates)} par offre en MAD). Affichage : ${currentCurrency} (détection auto · taux du site).`}
        >
          6 derniers mois · Affichage : {currentCurrency}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="sales">Ventes</option>
            <option value="target">Objectif</option>
            <option value="previousYear">Année précédente</option>
          </select>
        </div>
      </div>

      {/* Graphique principal — hauteur ADAPTÉE à la taille de la carte + état vide
          élégant quand aucune vente (au lieu d'une courbe plate « vide » à 0). */}
      <div className={`relative mb-5 ${widgetSize === 'small' ? 'h-44' : widgetSize === 'large' ? 'h-72' : 'h-60'}`}>
        <Line data={chartData} options={chartOptions} />
        {noSales && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <div className="rounded-xl border border-gray-200 bg-white/90 px-5 py-3 text-center shadow-sm backdrop-blur-sm">
              <p className="text-sm font-semibold text-gray-800">Aucune vente conclue sur la période</p>
              <p className="mt-0.5 text-xs text-gray-500">
                La ligne grise indique votre objectif ({formatMadMoney(lastRow?.target || 0, currentCurrency, rates)}).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* KPI en CARTES SOBRES : mêmes cartes neutres, une SEULE couleur sémantique
          sur « Objectif atteint » (vert/ambre/rouge selon la progression). */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 mb-5">
        <div className="rounded-lg border border-gray-200 bg-white p-3 min-w-0">
          <div className="text-xs font-medium text-gray-500">Ventes du mois</div>
          <div
            className="mt-1 text-lg font-bold text-gray-900 truncate"
            title={formatMadMoney(lastRow?.sales || 0, currentCurrency, rates)}
          >
            {formatMadMoney(lastRow?.sales || 0, currentCurrency, rates)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs font-medium text-gray-500">Objectif atteint</div>
          <div
            className={`mt-1 text-lg font-bold ${
              lastRow?.target > 0
                ? (() => {
                    const r = lastRow.sales / lastRow.target;
                    return r >= 0.85 ? 'text-green-600' : r >= 0.5 ? 'text-amber-600' : 'text-red-600';
                  })()
                : 'text-gray-400'
            }`}
          >
            {lastRow?.target > 0 ? `${Math.round((lastRow.sales / lastRow.target) * 100)} %` : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs font-medium text-gray-500">vs année précédente</div>
          <div className="mt-1 text-lg font-bold text-gray-900">
            {lastRow?.sales > 0 && lastRow?.previousYear > 0
              ? `${Math.round(((lastRow.sales - lastRow.previousYear) / lastRow.previousYear) * 100)} %`
              : '—'}
          </div>
        </div>
      </div>

      {/* Notifications automatiques */}
      {notifications.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-gray-900 mb-3">Notifications</h4>
          <div className="space-y-2">
            {notifications.map((notif) => (
              <div key={notif.id} className={`p-3 rounded-lg border-l-4 ${
                notif.type === 'warning' ? 'bg-yellow-50 border-yellow-400' :
                notif.type === 'success' ? 'bg-green-50 border-green-400' :
                'bg-blue-50 border-blue-400'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm min-w-0 break-words">{notif.message}</span>
                  {notif.action && notif.href && (
                    <a
                      href={notif.href}
                      className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50 shrink-0 whitespace-nowrap"
                    >
                      {notif.action}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions IA */}
      {aiSuggestions.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="font-semibold text-gray-900">Suggestions IA</h4>
            {aiSuggestionsSource && (
              <span className="text-xs font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                {aiSuggestionsSource === 'monitor' ? 'À jour · serveur' : 'À jour · analyse locale'}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {aiSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-1 text-xs rounded ${
                        suggestion.impact === 'high' ? 'bg-red-100 text-red-800' :
                        suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {suggestion.impact.toUpperCase()}
                      </span>
                      <span className="font-medium text-sm">{suggestion.title}</span>
                    </div>
                    <p className="text-sm text-gray-600">{suggestion.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Benchmark secteur (aperçu : dernier mois du graphique pour « votre performance » jusqu’au 1er chargement détaillé) */}
      {benchmarkData && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="font-semibold text-gray-900">Benchmark secteur</h4>
            {benchmarkData.source && (
              <span className="text-xs font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                {benchmarkData.source === 'monitor' ? 'À jour · serveur' : 'À jour · analyse locale'}
              </span>
            )}
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3 text-center">
              <div>
                <div className="text-lg font-semibold text-gray-700">
                  {formatBenchmarkMoney(benchmarkData.average)}
                </div>
                <div className="text-sm text-gray-600">Moyenne secteur</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-green-600">
                  {formatBenchmarkMoney(benchmarkData.top25)}
                </div>
                <div className="text-sm text-gray-600">Top 25%</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-blue-600">
                  {formatBenchmarkMoney(benchmarkData.yourPerformance)}
                </div>
                <div className="text-sm text-gray-600">Votre performance</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Ouvrez « Benchmark secteur » pour synchroniser avec{' '}
              <span className="font-medium">GET /ai/widgets/benchmark</span> (ou le calcul local).
            </p>
          </div>
        </div>
      )}

      {/* Raccourcis (une seule barre, sans doublon) */}
      <div className="border-t border-gray-100 pt-4 mb-4">
        <p className="text-xs text-gray-500 mb-2">
          Raccourcis : analyse détaillée, prévision et benchmark (serveur), export des données.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="px-3 py-1.5 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors"
          >
            Analyse complète
          </button>
          <button
            type="button"
            onClick={(ev) => handleQuickAction(ev, 'ai_forecast')}
            className="px-3 py-1.5 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors"
          >
            Prévision IA
          </button>
          <button
            type="button"
            onClick={() => openBenchmarkModal()}
            className="px-3 py-1.5 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors"
          >
            Benchmark secteur
          </button>
          <button
            type="button"
            onClick={(ev) => handleQuickAction(ev, 'export_data')}
            className="px-3 py-1.5 bg-orange-100 text-orange-800 border border-orange-300 rounded hover:bg-orange-200 text-sm transition-colors"
          >
            Exporter
          </button>
        </div>
      </div>

      {/* Modales (simplifiées) */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-3">
              <h3 className="text-lg font-bold text-gray-900">Analyse complète des ventes</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                title="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              {/* Récapitulatif RÉEL (6 derniers mois) */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5 mb-4">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-500">Ventes cumulées</div>
                  <div className="mt-1 text-lg font-bold text-gray-900 truncate" title={money(totalSales)}>{money(totalSales)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-500">Objectif cumulé</div>
                  <div className="mt-1 text-lg font-bold text-gray-900 truncate" title={money(totalTarget)}>{money(totalTarget)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-500">Atteinte globale</div>
                  <div className={`mt-1 text-lg font-bold ${overallPct >= 85 ? 'text-green-600' : overallPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {totalTarget > 0 ? `${overallPct} %` : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-500">Offres envoyées</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{totalOffers}</div>
                </div>
              </div>

              {/* Détail mois par mois */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Mois</th>
                      <th className="px-3 py-2 text-right font-medium">Ventes</th>
                      <th className="px-3 py-2 text-right font-medium">Objectif</th>
                      <th className="px-3 py-2 text-right font-medium">Écart</th>
                      <th className="px-3 py-2 text-right font-medium">% obj.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.map((d) => {
                      const pct = d.target > 0 ? Math.round((d.sales / d.target) * 100) : null;
                      const gap = d.sales - d.target;
                      return (
                        <tr key={d.month} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium text-gray-800">{d.month}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{money(d.sales)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{money(d.target)}</td>
                          <td className={`px-3 py-2 text-right ${gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {gap >= 0 ? '+' : ''}{money(gap)}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${pct == null ? 'text-gray-400' : pct >= 85 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {pct == null ? '—' : `${pct} %`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lecture honnête (données réelles, pas de recommandation inventée) */}
              <p className="mt-3 text-xs text-gray-500">
                {bestMonth && bestMonth.sales > 0
                  ? `Meilleur mois : ${bestMonth.month} (${money(bestMonth.sales)}). `
                  : 'Aucune vente conclue sur la période. '}
                Pour des prévisions et un comparatif secteur, utilisez « Prévision IA » et « Benchmark secteur ».
              </p>
            </div>
          </div>
        </div>
      )}

      {showForecast && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Prévision IA</h3>
              {forecastSource && !forecastLoading && (
                <span className="text-xs font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                  {forecastSource === 'monitor' ? 'Source : serveur (monitor)' : 'Source : analyse locale'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Prévisions issues du service{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">/ai/widgets/predictions</code> lorsque vous êtes
              connecté et autorisé ; sinon modèle local basé sur vos annonces.
            </p>

            {forecastLoading && (
              <div className="flex items-center gap-3 py-8 justify-center text-gray-600">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
                <span>Analyse en cours…</span>
              </div>
            )}

            {!forecastLoading && forecastPredictions.length === 0 && (
              <p className="text-sm text-gray-500 py-4">
                Aucune donnée de prévision à afficher. Vérifiez votre connexion ou votre abonnement aux fonctions IA.
              </p>
            )}

            {!forecastLoading && forecastPredictions.length > 0 && (
              <ul className="space-y-4 mb-6">
                {forecastPredictions.map((p, idx) => (
                  <li
                    key={`${p.metric}-${idx}`}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                  >
                    <div className="font-medium text-gray-900 mb-2">{p.metric}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
                      <div>
                        <span className="text-gray-500">Actuel : </span>
                        {formatPredictionMetricValue(p.metric, p.currentValue)}
                      </div>
                      <div>
                        <span className="text-gray-500">Prévu ({timeframeLabel(p.timeframe)}) : </span>
                        {formatPredictionMetricValue(p.metric, p.predictedValue)}
                      </div>
                      <div>
                        <span className="text-gray-500">Confiance : </span>
                        {Math.round((p.confidence ?? 0) * 100)} %
                      </div>
                      <div>
                        <span className="text-gray-500">Tendance : </span>
                        {trendLabel(p.trend)}
                      </div>
                    </div>
                    {p.factors?.length ? (
                      <div className="mt-3 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">Facteurs : </span>
                        {p.factors.join(' · ')}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                disabled={forecastLoading}
                onClick={() => {
                  if (!forecastLoading) handleAIForecast();
                }}
                className="px-4 py-2 bg-orange-100 text-orange-900 border border-orange-300 rounded hover:bg-orange-200 disabled:opacity-50 text-sm"
              >
                Actualiser
              </button>
              <button
                type="button"
                onClick={() => setShowForecast(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showBenchmark && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Benchmark secteur</h3>
              {benchmarkModalSource && !benchmarkModalLoading && (
                <span className="text-xs font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                  {benchmarkModalSource === 'monitor'
                    ? 'Source : serveur (monitor)'
                    : 'Source : analyse locale'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Données issues de <code className="text-xs bg-gray-100 px-1 rounded">/ai/widgets/benchmark</code> lorsque
              le monitor est disponible et votre compte autorisé ; sinon même logique que le fallback prédictions
              (annonces actives).
            </p>

            {benchmarkModalLoading && (
              <div className="flex items-center gap-3 py-8 justify-center text-gray-600">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
                <span>Chargement du benchmark…</span>
              </div>
            )}

            {!benchmarkModalLoading && !benchmarkModalData && (
              <p className="text-sm text-gray-500 py-4">
                Connectez-vous pour afficher le benchmark. Le bandeau du widget reprend le dernier point du graphique
                jusqu’à la première synchronisation.
              </p>
            )}

            {!benchmarkModalLoading && benchmarkModalData && (
              <>
                <p className="text-sm font-medium text-gray-800 mb-2">{benchmarkModalData.sector}</p>
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-lg font-semibold text-gray-700">
                        {formatBenchmarkMoney(benchmarkModalData.average)}
                      </div>
                      <div className="text-sm text-gray-600">Moyenne secteur</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-green-600">
                        {formatBenchmarkMoney(benchmarkModalData.top25)}
                      </div>
                      <div className="text-sm text-gray-600">Top 25 %</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-blue-600">
                        {formatBenchmarkMoney(benchmarkModalData.yourPerformance)}
                      </div>
                      <div className="text-sm text-gray-600">Votre performance (estim.)</div>
                    </div>
                  </div>
                </div>
                {benchmarkModalData.note && (
                  <p className="text-xs text-gray-600 mb-4 border-l-4 border-orange-200 pl-3">{benchmarkModalData.note}</p>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                disabled={benchmarkModalLoading}
                onClick={() => {
                  if (!benchmarkModalLoading) openBenchmarkModal();
                }}
                className="px-4 py-2 bg-orange-100 text-orange-900 border border-orange-300 rounded hover:bg-orange-200 disabled:opacity-50 text-sm"
              >
                Actualiser
              </button>
              <button
                type="button"
                onClick={() => setShowBenchmark(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SalesEvolutionWidgetEnriched; 