import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart as BarChartIcon,
  Brain,
  Check,
  CheckCircle,
  DollarSign,
  Info,
  Minus,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from '../../../utils/toast';
export const SalesEvolutionWidgetEnriched = ({ data = [] }: { data?: any[] }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'6m' | '12m' | '24m'>('12m');
  const [selectedMetric, setSelectedMetric] = useState<'sales' | 'units' | 'growth'>('sales');
  const [showDetails, setShowDetails] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [sectorData, setSectorData] = useState<any[]>([]);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [showAIForecast, setShowAIForecast] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<any>({});
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Données étendues pour 24 mois avec objectifs et année précédente
  const extendedData = React.useMemo(() => {
    const baseData = [
      { month: 'Jan 2023', sales: 1200000, units: 45, growth: 0, target: 1250000, previousYear: 1100000 },
      { month: 'Fév 2023', sales: 1350000, units: 52, growth: 12.5, target: 1300000, previousYear: 1150000 },
      { month: 'Mar 2023', sales: 1420000, units: 38, growth: 5.2, target: 1350000, previousYear: 1200000 },
      { month: 'Avr 2023', sales: 1580000, units: 67, growth: 11.3, target: 1400000, previousYear: 1250000 },
      { month: 'Mai 2023', sales: 1650000, units: 58, growth: 4.4, target: 1450000, previousYear: 1300000 },
      { month: 'Juin 2023', sales: 1720000, units: 72, growth: 4.2, target: 1500000, previousYear: 1350000 },
      { month: 'Juil 2023', sales: 1890000, units: 89, growth: 9.9, target: 1550000, previousYear: 1400000 },
      { month: 'Août 2023', sales: 1760000, units: 76, growth: -6.9, target: 1600000, previousYear: 1450000 },
      { month: 'Sep 2023', sales: 1650000, units: 65, growth: -6.3, target: 1650000, previousYear: 1500000 },
      { month: 'Oct 2023', sales: 1820000, units: 82, growth: 10.3, target: 1700000, previousYear: 1550000 },
      { month: 'Nov 2023', sales: 1910000, units: 91, growth: 4.9, target: 1750000, previousYear: 1600000 },
      { month: 'Déc 2023', sales: 1780000, units: 78, growth: -6.8, target: 1800000, previousYear: 1650000 },
      { month: 'Jan 2024', sales: 1950000, units: 95, growth: 9.6, target: 1850000, previousYear: 1200000 },
      { month: 'Fév 2024', sales: 2100000, units: 102, growth: 7.7, target: 1900000, previousYear: 1350000 },
      { month: 'Mar 2024', sales: 2250000, units: 108, growth: 7.1, target: 1950000, previousYear: 1420000 },
      { month: 'Avr 2024', sales: 2400000, units: 115, growth: 6.7, target: 2000000, previousYear: 1580000 },
      { month: 'Mai 2024', sales: 2550000, units: 122, growth: 6.3, target: 2050000, previousYear: 1650000 },
      { month: 'Juin 2024', sales: 2700000, units: 128, growth: 5.9, target: 2100000, previousYear: 1720000 },
      { month: 'Juil 2024', sales: 2850000, units: 135, growth: 5.6, target: 2150000, previousYear: 1890000 },
      { month: 'Août 2024', sales: 3000000, units: 142, growth: 5.3, target: 2200000, previousYear: 1760000 },
      { month: 'Sep 2024', sales: 3150000, units: 148, growth: 5.0, target: 2250000, previousYear: 1650000 },
      { month: 'Oct 2024', sales: 3300000, units: 155, growth: 4.8, target: 2300000, previousYear: 1820000 },
      { month: 'Nov 2024', sales: 3450000, units: 162, growth: 4.5, target: 2350000, previousYear: 1910000 },
      { month: 'Déc 2024', sales: 3600000, units: 168, growth: 4.3, target: 2400000, previousYear: 1780000 }
    ];

    // Filtrer selon la période sélectionnée
    const periods = {
      '6m': 6,
      '12m': 12,
      '24m': 24
    };

    return baseData.slice(-periods[selectedPeriod]);
  }, [selectedPeriod]);

  // Calculer les statistiques
  const stats = React.useMemo(() => {
    const totalSales = extendedData.reduce((sum: number, item: any) => sum + item.sales, 0);
    const totalUnits = extendedData.reduce((sum: number, item: any) => sum + item.units, 0);
    const avgGrowth = extendedData.reduce((sum: number, item: any) => sum + item.growth, 0) / extendedData.length;
    const avgSales = totalSales / extendedData.length;

    // Trouver les indices du meilleur et pire mois
    const bestMonthIndex = extendedData.reduce((maxIndex: number, item: any, index: number) =>
      item.sales > extendedData[maxIndex].sales ? index : maxIndex, 0);
    const worstMonthIndex = extendedData.reduce((minIndex: number, item: any, index: number) =>
      item.sales < extendedData[minIndex].sales ? index : minIndex, 0);

    return { totalSales, totalUnits, avgGrowth, avgSales, bestMonthIndex, worstMonthIndex };
  }, [extendedData]);

  // Calculer les prévisions
  const forecasts = React.useMemo(() => {
    const recentData = extendedData.slice(-3);
    const avgRecentSales = recentData.reduce((sum: number, item: any) => sum + item.sales, 0) / recentData.length;
    const trend = recentData[recentData.length - 1].sales - recentData[0].sales;

    return {
      optimistic: avgRecentSales * 1.15,
      realistic: avgRecentSales * 1.05,
      pessimistic: avgRecentSales * 0.95,
      trend: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable'
    };
  }, [extendedData]);

  // Données de benchmarking secteur (simulation)
  const sectorBenchmarkData = React.useMemo(() => {
    return [
      { month: 'Jan 2024', sectorAvg: 1800000, companySales: 1950000, difference: 8.3 },
      { month: 'Fév 2024', sectorAvg: 1950000, companySales: 2100000, difference: 7.7 },
      { month: 'Mar 2024', sectorAvg: 2100000, companySales: 2250000, difference: 7.1 },
      { month: 'Avr 2024', sectorAvg: 2250000, companySales: 2400000, difference: 6.7 },
      { month: 'Mai 2024', sectorAvg: 2400000, companySales: 2550000, difference: 6.3 },
      { month: 'Juin 2024', sectorAvg: 2550000, companySales: 2700000, difference: 5.9 }
    ];
  }, []);

  // Données de benchmark enrichies
  React.useEffect(() => {
    const currentMonth = extendedData[extendedData.length - 1];
    const avgSales = extendedData.reduce((sum, item) => sum + item.sales, 0) / extendedData.length;
    
    setBenchmarkData({
      sectorAverage: 2200000,
      top25Percent: 2800000,
      yourPerformance: avgSales,
      sectorRank: 85, // Top 15%
      performanceGap: ((avgSales - 2200000) / 2200000) * 100,
      top25Gap: ((2800000 - avgSales) / avgSales) * 100
    });
  }, [extendedData]);

  // Insights IA enrichis
  React.useEffect(() => {
    const currentMonth = extendedData[extendedData.length - 1];
    const recentTrend = extendedData.slice(-3).reduce((sum, item) => sum + item.growth, 0) / 3;
    
    const newInsights = [
      {
        id: 1,
        type: 'pricing',
        title: 'Pricing Dynamique Recommandé',
        description: 'Vos prix sont 8% en dessous de la moyenne secteur. Augmentation de 5-7% recommandée.',
        impact: 'high',
        confidence: 92,
        action: 'Ajuster les prix de la gamme premium',
        estimatedGain: '+12% CA'
      },
      {
        id: 2,
        type: 'catalog',
        title: 'Repositionnement Catalogue',
        description: 'Les engins compacts représentent 65% des ventes. Focus sur cette catégorie.',
        impact: 'medium',
        confidence: 88,
        action: 'Élargir la gamme compacte',
        estimatedGain: '+8% parts de marché'
      },
      {
        id: 3,
        type: 'promo',
        title: 'Campagne Promotionnelle',
        description: 'Période de faible activité détectée (Août-Sep). Campagne ciblée recommandée.',
        impact: 'high',
        confidence: 85,
        action: 'Lancer promotion "Fin d\'été"',
        estimatedGain: '+15% ventes saisonnières'
      },
      {
        id: 4,
        type: 'forecast',
        title: 'Prévision IA - Q1 2025',
        description: 'Croissance de 12% attendue basée sur les tendances et données sectorielles.',
        impact: 'medium',
        confidence: 78,
        action: 'Préparer l\'inventaire',
        estimatedGain: 'Optimisation stock'
      }
    ];

    setAiInsights(newInsights);
  }, [extendedData]);

  // Système de notifications automatiques enrichi
  React.useEffect(() => {
    const currentMonth = extendedData[extendedData.length - 1];
    const previousMonth = extendedData[extendedData.length - 2];

    const newNotifications = [];

    // Notification si baisse de plus de 15%
    if (previousMonth && currentMonth.growth < -15) {
      newNotifications.push({
        id: Date.now(),
        type: 'warning',
        title: 'Baisse significative détectée',
        message: `${currentMonth.month} en recul de ${Math.abs(currentMonth.growth)}% vs ${previousMonth.month}`,
        suggestion: 'Suggéré : publier engins compacts ou repositionner la 320D à 860k MAD',
        timestamp: new Date().toISOString(),
        priority: 'high',
        action: 'correct-month'
      });
    }

    // Notification si performance supérieure au secteur
    const sectorComparison = sectorBenchmarkData.find(item => item.month === currentMonth.month);
    if (sectorComparison && sectorComparison.difference > 10) {
      newNotifications.push({
        id: Date.now() + 1,
        type: 'success',
        title: 'Performance exceptionnelle',
        message: `${currentMonth.month} : +${sectorComparison.difference}% vs moyenne secteur`,
        suggestion: 'Capitaliser sur cette dynamique avec des promotions ciblées',
        timestamp: new Date().toISOString(),
        priority: 'medium',
        action: 'publish-promo'
      });
    }

    // Notification si objectif non atteint
    if (currentMonth.sales < currentMonth.target * 0.9) {
      newNotifications.push({
        id: Date.now() + 2,
        type: 'alert',
        title: 'Objectif en retard',
        message: `${currentMonth.month} : ${((currentMonth.sales / currentMonth.target) * 100).toFixed(1)}% de l'objectif`,
        suggestion: 'Actions correctives : promotions agressives ou nouveaux prospects',
        timestamp: new Date().toISOString(),
        priority: 'high',
        action: 'add-equipment'
      });
    }

    // Notification de benchmarking automatique
    if (sectorComparison) {
      newNotifications.push({
        id: Date.now() + 3,
        type: 'info',
        title: 'Benchmarking secteur',
        message: `${currentMonth.month} : ${sectorComparison.difference > 0 ? '+' : ''}${sectorComparison.difference}% vs secteur`,
        suggestion: 'Voir comparaison détaillée avec les concurrents',
        timestamp: new Date().toISOString(),
        priority: 'low',
        action: 'show-benchmark'
      });
    }

    // Notification IA - Pricing dynamique
    if (benchmarkData.performanceGap > 5) {
      newNotifications.push({
        id: Date.now() + 4,
        type: 'ai',
        title: 'IA - Pricing Dynamique',
        message: 'Opportunité d\'augmentation de prix détectée',
        suggestion: 'Augmenter les prix de 5-7% pour optimiser la marge',
        timestamp: new Date().toISOString(),
        priority: 'medium',
        action: 'adjust-pricing'
      });
    }

    // Notification IA - Prévision positive
    const recentTrend = extendedData.slice(-3).reduce((sum, item) => sum + item.growth, 0) / 3;
    if (recentTrend > 5) {
      newNotifications.push({
        id: Date.now() + 5,
        type: 'ai',
        title: 'IA - Prévision Positive',
        message: 'Tendance positive détectée pour les 3 prochains mois',
        suggestion: 'Préparer l\'inventaire pour la croissance attendue',
        timestamp: new Date().toISOString(),
        priority: 'low',
        action: 'prepare-inventory'
      });
    }

    setNotifications(prev => [...newNotifications, ...prev.slice(0, 6)]);
  }, [extendedData, sectorBenchmarkData, benchmarkData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-MA', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-MA').format(num);
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'sales': return 'Chiffre d\'affaires (MAD)';
      case 'units': return 'Nombre d\'unités vendues';
      case 'growth': return 'Croissance (%)';
      default: return '';
    }
  };

  const getMetricValue = (item: any) => {
    switch (selectedMetric) {
      case 'sales': return item.sales;
      case 'units': return item.units;
      case 'growth': return item.growth;
      default: return item.sales;
    }
  };

  const getMetricColor = (value: number) => {
    if (selectedMetric === 'sales') {
      return value > 0 ? 'text-green-600' : 'text-red-600';
    } else if (selectedMetric === 'growth') {
      return value >= 0 ? '#22c55e' : '#ef4444';
    } else {
      return '#3b82f6';
    }
  };

  // Fonction d'export des données
  const handleExport = async (format: 'pdf' | 'excel') => {
    setIsExporting(true);
    setExportFormat(format);
    
    try {
      // Simulation d'export
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Créer les données d'export
      const exportData = {
        period: selectedPeriod,
        metric: selectedMetric,
        data: extendedData,
        stats: stats,
        forecasts: forecasts,
        benchmark: benchmarkData,
        insights: aiInsights,
        timestamp: new Date().toISOString()
      };

      if (format === 'excel') {
        // Simulation d'export Excel
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evolution-ventes-${selectedPeriod}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Export Excel terminé avec succès');
      } else {
        // Simulation d'export PDF
        toast('Export PDF terminé avec succès');
      }
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      toast('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  // Fonction d'analyse des tendances
  const analyzeTrends = () => {
    const recentData = extendedData.slice(-6);
    const trend = recentData[recentData.length - 1][selectedMetric] - recentData[0][selectedMetric];
    const avgGrowth = recentData.reduce((sum, item) => sum + item.growth, 0) / recentData.length;

    return {
      trend: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
      strength: Math.abs(trend) > (stats.avgSales * 0.1) ? 'strong' : 'weak',
      recommendation: trend > 0 ? 'Continuer la stratégie actuelle' : 'Revoir la stratégie commerciale',
      avgGrowth
    };
  };

  // Fonction de comparaison avec objectifs
  const compareWithTargets = () => {
    const currentMonth = extendedData[extendedData.length - 1];
    const targetSales = 2500000; // Objectif mensuel
    const targetGrowth = 5; // Objectif de croissance

    return {
      salesAchievement: (currentMonth.sales / targetSales) * 100,
      growthAchievement: (currentMonth.growth / targetGrowth) * 100,
      onTrack: currentMonth.sales >= targetSales && currentMonth.growth >= targetGrowth
    };
  };

  // Fonction de prévision basée sur les tendances
  const generateForecast = () => {
    const recentData = extendedData.slice(-3);
    const avgSales = recentData.reduce((sum, item) => sum + item.sales, 0) / recentData.length;
    const trend = recentData[recentData.length - 1].sales - recentData[0].sales;

    return {
      nextMonth: avgSales + (trend / 3),
      nextQuarter: avgSales * 3 + (trend * 2),
      confidence: Math.abs(trend) < avgSales * 0.1 ? 'high' : 'medium'
    };
  };

  // Fonctions d'action pour les boutons
  const handleNotificationAction = async (action: string, notificationId: number) => {
    setActionLoading(action);
    try {
      switch (action) {
        case 'correct-month':
          // Simulation d'action corrective
          await new Promise(resolve => setTimeout(resolve, 1000));
          toast('Action corrective appliquée : Promotion lancée pour le mois en cours');
          break;
        case 'publish-promo':
          await new Promise(resolve => setTimeout(resolve, 1000));
          toast('Promotion publiée avec succès');
          break;
        case 'add-equipment':
          await new Promise(resolve => setTimeout(resolve, 1000));
          toast('Nouveaux équipements ajoutés au catalogue');
          break;
        case 'show-benchmark':
          setShowBenchmark(true);
          break;
        case 'adjust-pricing':
          await new Promise(resolve => setTimeout(resolve, 1000));
          toast('Prix ajustés selon les recommandations IA');
          break;
        case 'prepare-inventory':
          await new Promise(resolve => setTimeout(resolve, 1000));
          toast('Inventaire préparé pour la croissance attendue');
          break;
        default:
          console.log('Action non reconnue:', action);
      }
      
      // Supprimer la notification après action
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Erreur lors de l\'action:', error);
      toast('Erreur lors de l\'exécution de l\'action');
    } finally {
      setActionLoading(null);
    }
  };

  const handleInsightAction = async (insight: any) => {
    setActionLoading(`insight-${insight.id}`);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      switch (insight.type) {
        case 'pricing':
          toast(`Pricing dynamique appliqué : ${insight.action}`);
          break;
        case 'catalog':
          toast(`Catalogue repositionné : ${insight.action}`);
          break;
        case 'promo':
          toast(`Campagne promotionnelle lancée : ${insight.action}`);
          break;
        case 'forecast':
          toast(`Prévision IA appliquée : ${insight.action}`);
          break;
        default:
          toast(`Action appliquée : ${insight.action}`);
      }
    } catch (error) {
      console.error('Erreur lors de l\'application de l\'insight:', error);
      toast('Erreur lors de l\'application de l\'insight');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMonthClick = (month: string) => {
    setSelectedMonth(month);
    // Afficher les détails du mois sélectionné
    const monthData = extendedData.find(item => item.month === month);
    if (monthData) {
      toast(`Détails ${month}:\nCA: ${formatCurrency(monthData.sales)}\nUnités: ${monthData.units}\nCroissance: ${monthData.growth}%\nObjectif: ${formatCurrency(monthData.target)}`);
    }
  };

  const handleQuickAction = async (action: string) => {
    setActionLoading(action);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      switch (action) {
        case 'refresh-data':
          // Recharger les données
          toast('Données actualisées');
          break;
        case 'generate-report':
          // Générer un rapport
          toast('Rapport généré avec succès');
          break;
        case 'send-alert':
          // Envoyer une alerte
          toast('Alerte envoyée à l\'équipe');
          break;
        case 'optimize-prices':
          // Optimiser les prix
          toast('Prix optimisés selon les recommandations IA');
          break;
        default:
          console.log('Action rapide non reconnue:', action);
      }
    } catch (error) {
      console.error('Erreur lors de l\'action rapide:', error);
      toast('Erreur lors de l\'exécution de l\'action');
    } finally {
      setActionLoading(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'alert': return <AlertCircle className="w-4 h-4" />;
      case 'info': return <Info className="w-4 h-4" />;
      case 'ai': return <Brain className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'alert': return 'bg-red-50 border-red-200';
      case 'info': return 'bg-blue-50 border-blue-200';
      case 'ai': return 'bg-purple-50 border-purple-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getNotificationTextColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-green-800';
      case 'warning': return 'text-yellow-800';
      case 'alert': return 'text-red-800';
      case 'info': return 'text-blue-800';
      case 'ai': return 'text-purple-800';
      default: return 'text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {/* En-tête avec contrôles */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Évolution des Ventes</h3>
        <div className="flex gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as '6m' | '12m' | '24m')}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="6m">6 mois</option>
            <option value="12m">12 mois</option>
            <option value="24m">24 mois</option>
          </select>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as 'sales' | 'units' | 'growth')}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="sales">CA</option>
            <option value="units">Unités</option>
            <option value="growth">Croissance</option>
          </select>
        </div>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-lg font-bold text-orange-600">{formatCurrency(stats.totalSales)}</div>
          <div className="text-xs text-gray-600">CA Total</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-lg font-bold text-orange-600">{formatNumber(stats.totalUnits)}</div>
          <div className="text-xs text-gray-600">Unités Vendues</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-lg font-bold text-orange-600">{formatCurrency(stats.avgSales)}</div>
          <div className="text-xs text-gray-600">CA Moyen</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className={`text-lg font-bold ${stats.avgGrowth >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
            {stats.avgGrowth >= 0 ? '+' : ''}{stats.avgGrowth.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Croissance</div>
        </div>
      </div>

      {/* Section Benchmark */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 rounded-lg border border-orange-200">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-gray-900">Benchmark Secteur</h4>
          <button
            onClick={() => setShowBenchmark(true)}
            className="text-xs text-orange-700 hover:text-orange-900 font-medium"
          >
            Voir détails →
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-white rounded border border-orange-200">
            <div className="text-sm font-bold text-orange-700">{formatCurrency(benchmarkData.sectorAverage || 0)}</div>
            <div className="text-xs text-gray-600">Moyenne secteur</div>
          </div>
          <div className="text-center p-2 bg-white rounded border border-amber-200">
            <div className="text-sm font-bold text-amber-700">{formatCurrency(benchmarkData.top25Percent || 0)}</div>
            <div className="text-xs text-gray-600">Top 25%</div>
          </div>
          <div className="text-center p-2 bg-white rounded border border-orange-300">
            <div className="text-sm font-bold text-orange-800">{formatCurrency(benchmarkData.yourPerformance || 0)}</div>
            <div className="text-xs text-gray-600">Votre performance</div>
          </div>
        </div>
        
        <div className="mt-3 text-center">
          <div className="text-xs text-gray-600">
            Rang secteur: <span className="font-semibold text-amber-700">Top {benchmarkData.sectorRank || 0}%</span>
          </div>
          <div className="text-xs text-gray-600">
            Écart vs secteur: <span className={`font-semibold ${(benchmarkData.performanceGap || 0) >= 0 ? 'text-orange-700' : 'text-red-600'}`}>
              {(benchmarkData.performanceGap || 0) >= 0 ? '+' : ''}{(benchmarkData.performanceGap || 0).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Section Insights IA */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-4 rounded-lg border border-amber-200">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-gray-900">Insights IA</h4>
          <button
            onClick={() => setShowAIAnalysis(true)}
            className="text-xs text-amber-700 hover:text-amber-900 font-medium"
          >
            Voir tout →
          </button>
        </div>
        
        <div className="space-y-2">
          {aiInsights.slice(0, 2).map((insight) => (
            <div key={insight.id} className="flex items-start gap-2 p-2 bg-white rounded border border-amber-100">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${
                insight.impact === 'high' ? 'bg-red-500' : 
                insight.impact === 'medium' ? 'bg-amber-500' : 'bg-yellow-500'
              }`}></div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-900">{insight.title}</div>
                <div className="text-xs text-gray-600">{insight.description}</div>
                <div className="text-xs text-amber-700 font-medium">{insight.estimatedGain}</div>
              </div>
              <button
                onClick={() => handleInsightAction(insight)}
                disabled={actionLoading === `insight-${insight.id}`}
                className="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading === `insight-${insight.id}` ? '...' : 'Appliquer'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Section Notifications */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Notifications</h4>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="text-xs text-yellow-700 hover:text-yellow-900 font-medium"
            >
              {showNotifications ? 'Masquer' : 'Voir tout'} →
            </button>
          </div>
          
          <div className="space-y-2">
            {(showNotifications ? notifications : notifications.slice(0, 2)).map((notification) => (
              <div key={notification.id} className={`p-3 rounded-lg border ${getNotificationColor(notification.type)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 flex-1">
                    <div className="text-lg">{getNotificationIcon(notification.type)}</div>
                    <div className="flex-1">
                      <div className={`text-sm font-semibold ${getNotificationTextColor(notification.type)}`}>
                        {notification.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">{notification.message}</div>
                      <div className="text-xs text-gray-500 mt-1">{notification.suggestion}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => handleNotificationAction(notification.action, notification.id)}
                      disabled={actionLoading === notification.action}
                      className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 disabled:opacity-50"
                    >
                      {actionLoading === notification.action ? '...' : 'Action'}
                    </button>
                    <button
                      onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                      className="px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graphique multi-courbes */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h4 className="text-sm font-semibold text-gray-900">{getMetricLabel()}</h4>
            
            {selectedMonth && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Mois sélectionné:</span>
                <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">
                  {selectedMonth}
                </span>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="Effacer la sélection"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={showMultiChart}
                onChange={(e) => setShowMultiChart(e.target.checked)}
                className="w-3 h-3"
              />
              Multi-courbes
            </label>
            
            <button
              onClick={() => handleQuickAction('refresh-data')}
              disabled={actionLoading === 'refresh-data'}
              className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
              title="Actualiser les données"
            >
              {actionLoading === 'refresh-data' ? '...' : <RefreshCw className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {showMultiChart ? (
          <div className="h-48 flex items-end justify-between gap-1">
            {extendedData.map((item: any, index: number) => {
              const value = getMetricValue(item);
              const targetValue = selectedMetric === 'sales' ? item.target : selectedMetric === 'units' ? item.units * 1.1 : 5;
              const previousValue = selectedMetric === 'sales' ? item.previousYear : selectedMetric === 'units' ? item.units * 0.9 : 0;
              
              const maxValue = Math.max(
                ...extendedData.map(getMetricValue),
                ...extendedData.map(item => selectedMetric === 'sales' ? item.target : selectedMetric === 'units' ? item.units * 1.1 : 5),
                ...extendedData.map(item => selectedMetric === 'sales' ? item.previousYear : selectedMetric === 'units' ? item.units * 0.9 : 0)
              );

              const isSelected = selectedMonth === item.month;
              
              const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const targetHeight = maxValue > 0 ? (targetValue / maxValue) * 100 : 0;
              const previousHeight = maxValue > 0 ? (previousValue / maxValue) * 100 : 0;

              return (
                <div 
                  key={index} 
                  className={`flex-1 flex flex-col items-center cursor-pointer transition-all ${
                    selectedMonth === item.month ? 'transform scale-105' : 'hover:scale-102'
                  }`}
                  onClick={() => handleMonthClick(item.month)}
                >
                  {/* Barre principale (ventes réelles) */}
                  <div
                    className={`w-full rounded-t transition-all duration-300 cursor-pointer relative ${
                      selectedMonth === item.month ? 'ring-2 ring-orange-400' : ''
                    }`}
                    style={{
                      height: `${height}%`,
                      minHeight: '4px',
                      backgroundColor: selectedMonth === item.month ? '#3b82f6' : '#3b82f6'
                    }}
                    title={`${item.month}: ${selectedMetric === 'sales' ? formatCurrency(value) : selectedMetric === 'units' ? formatNumber(value) : `${value}%`}`}
                  >
                    {/* Ligne objectif */}
                    <div
                      className="absolute w-full border-t-2 border-dashed border-orange-500"
                      style={{
                        top: `${targetHeight}%`,
                        transform: 'translateY(-50%)'
                      }}
                      title={`Objectif: ${selectedMetric === 'sales' ? formatCurrency(targetValue) : selectedMetric === 'units' ? formatNumber(targetValue) : `${targetValue}%`}`}
                    />
                    
                    {/* Ligne année précédente */}
                    <div
                      className="absolute w-full border-t-2 border-dashed border-gray-400"
                      style={{
                        top: `${previousHeight}%`,
                        transform: 'translateY(-50%)'
                      }}
                      title={`Année précédente: ${selectedMetric === 'sales' ? formatCurrency(previousValue) : selectedMetric === 'units' ? formatNumber(previousValue) : `${previousValue}%`}`}
                    />
                  </div>
                  
                  <div className={`text-xs mt-1 transform rotate-45 origin-left font-medium ${
                    selectedMonth === item.month ? 'text-orange-600' : 'text-gray-500'
                  }`}>
                    {item.month.split(' ')[0]}
                  </div>
                  {selectedMonth === item.month && (
                    <div className="text-xs text-orange-600 font-bold mt-1">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-48 flex items-end justify-between gap-1">
            {extendedData.map((item: any, index: number) => {
              const value = getMetricValue(item);
              const maxValue = Math.max(...extendedData.map(getMetricValue));
              const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const color = getMetricColor(value);

              return (
                <div 
                  key={index} 
                  className={`flex-1 flex flex-col items-center cursor-pointer transition-all ${
                    selectedMonth === item.month ? 'transform scale-105' : 'hover:scale-102'
                  }`}
                  onClick={() => handleMonthClick(item.month)}
                >
                  <div
                    className={`w-full rounded-t transition-all duration-300 cursor-pointer ${
                      selectedMonth === item.month ? 'ring-2 ring-orange-400' : ''
                    }`}
                    style={{
                      height: `${height}%`,
                      backgroundColor: color,
                      minHeight: '4px'
                    }}
                    title={`${item.month}: ${selectedMetric === 'sales' ? formatCurrency(value) : selectedMetric === 'units' ? formatNumber(value) : `${value}%`}`}
                  />
                  <div className={`text-xs mt-1 transform rotate-45 origin-left font-medium ${
                    selectedMonth === item.month ? 'text-orange-600' : 'text-gray-500'
                  }`}>
                    {item.month.split(' ')[0]}
                  </div>
                  {selectedMonth === item.month && (
                    <div className="text-xs text-orange-600 font-bold mt-1">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Légende du graphique multi-courbes */}
        {showMultiChart && (
          <div className="mt-3 flex justify-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Ventes réelles</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-t-2 border-dashed border-orange-500"></div>
              <span>Objectifs</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-t-2 border-dashed border-gray-400"></div>
              <span>Année précédente</span>
            </div>
          </div>
        )}
      </div>

      {/* Analyse des performances */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <h5 className="text-sm font-semibold text-amber-800 mb-2">Meilleur mois</h5>
          <div className="text-base font-bold text-amber-600">{extendedData[stats.bestMonthIndex].month}</div>
          <div className="text-sm text-amber-700">{formatCurrency(extendedData[stats.bestMonthIndex].sales)}</div>
          <div className="text-xs text-amber-600">{extendedData[stats.bestMonthIndex].units} unités</div>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h5 className="text-sm font-semibold text-yellow-800 mb-2">Mois le plus faible</h5>
          <div className="text-base font-bold text-yellow-600">{extendedData[stats.worstMonthIndex].month}</div>
          <div className="text-sm text-yellow-700">{formatCurrency(extendedData[stats.worstMonthIndex].sales)}</div>
          <div className="text-xs text-yellow-600">{extendedData[stats.worstMonthIndex].units} unités</div>
        </div>
      </div>

      {/* Tableau détaillé */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h5 className="text-sm font-semibold text-gray-900">Détail mensuel</h5>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Mois</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">CA</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Unités</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Croissance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extendedData.map((item, index) => (
                <tr 
                  key={index} 
                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedMonth === item.month ? 'bg-orange-50 border-l-4 border-orange-400' : ''
                  }`}
                  onClick={() => handleMonthClick(item.month)}
                >
                  <td className="px-4 py-2 text-sm text-gray-900 font-medium">
                    {item.month}
                    {selectedMonth === item.month && (
                      <span className="ml-2 text-orange-600"><Check className="w-3 h-3" /></span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.sales)}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatNumber(item.units)}</td>
                  <td className={`px-4 py-2 text-sm text-right font-medium ${item.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.growth >= 0 ? '+' : ''}{item.growth}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

              {/* Actions et analyses avancées */}
      <div className="space-y-4">
        {/* Boutons d'action */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowDetails(true)}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
          >
            Analyse complète
          </button>
          <button
            onClick={() => setShowForecast(true)}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
          >
            Prévisions
          </button>
          <button
            onClick={() => setShowAIForecast(true)}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
          >
            Prévision IA
          </button>
          <button
            onClick={() => setShowBenchmark(true)}
            className="px-4 py-2 bg-orange-700 text-white rounded-lg hover:bg-orange-800 text-sm"
          >
            Benchmark
          </button>
          <button
            onClick={() => setShowAIAnalysis(true)}
            className="px-4 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 text-sm"
          >
            Insights IA
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={isExporting}
            className="px-4 py-2 bg-yellow-700 text-white rounded-lg hover:bg-yellow-800 text-sm disabled:opacity-50"
          >
            {isExporting && exportFormat === 'excel' ? 'Export...' : 'Export Excel'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
            className="px-4 py-2 bg-orange-800 text-white rounded-lg hover:bg-orange-900 text-sm disabled:opacity-50"
          >
            {isExporting && exportFormat === 'pdf' ? 'Export...' : 'Export PDF'}
          </button>
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className="px-4 py-2 bg-amber-800 text-white rounded-lg hover:bg-amber-900 text-sm"
          >
            Outils démo
          </button>
        </div>

        {showQuickActions && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border">
            <p className="text-xs text-gray-600 mb-3">
              Ces commandes sont une <span className="font-medium">démonstration côté client</span> (pas d’appel API métier réel pour l’instant).
            </p>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Scénarios de démo</h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleQuickAction('refresh-data')}
                disabled={actionLoading === 'refresh-data'}
                className="px-3 py-2 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
              >
                {actionLoading === 'refresh-data' ? '...' : <><RefreshCw className="w-3 h-3 mr-1" />Actualiser données</>}
              </button>
              <button
                onClick={() => handleQuickAction('generate-report')}
                disabled={actionLoading === 'generate-report'}
                className="px-3 py-2 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 disabled:opacity-50"
              >
                {actionLoading === 'generate-report' ? '...' : <><BarChartIcon className="w-3 h-3 mr-1" />Générer rapport</>}
              </button>
              <button
                onClick={() => handleQuickAction('send-alert')}
                disabled={actionLoading === 'send-alert'}
                className="px-3 py-2 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                {actionLoading === 'send-alert' ? '...' : <><AlertTriangle className="w-3 h-3 mr-1" />Envoyer alerte</>}
              </button>
              <button
                onClick={() => handleQuickAction('optimize-prices')}
                disabled={actionLoading === 'optimize-prices'}
                className="px-3 py-2 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {actionLoading === 'optimize-prices' ? '...' : <><DollarSign className="w-3 h-3 mr-1" />Optimiser prix</>}
              </button>
            </div>
          </div>
        )}

        {/* Analyse rapide des tendances */}
        <div className="bg-gradient-to-r from-orange-50 to-amber-100 p-4 rounded-lg border border-orange-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Analyse Rapide</h4>
          <div className="grid grid-cols-3 gap-4">
            {(() => {
              const trends = analyzeTrends();
              const targets = compareWithTargets();
              const forecast = generateForecast();

              return (
                <>
                  <div className="text-center">
                    <div className={`text-base font-bold ${trends.trend === 'up' ? 'text-orange-600' : trends.trend === 'down' ? 'text-orange-700' : 'text-orange-500'}`}>
                      {trends.trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : trends.trend === 'down' ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </div>
                    <div className="text-xs text-gray-600">Tendance</div>
                    <div className="text-xs font-medium text-gray-700">{trends.strength === 'strong' ? 'Forte' : 'Faible'}</div>
                  </div>

                  <div className="text-center">
                    <div className={`text-base font-bold ${targets.onTrack ? 'text-amber-600' : 'text-amber-700'}`}>
                      {targets.salesAchievement.toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-600">Objectif CA</div>
                    <div className="text-xs font-medium text-gray-700">{targets.onTrack ? 'Atteint' : 'En retard'}</div>
                  </div>

                  <div className="text-center">
                    <div className={`text-base font-bold ${forecast.confidence === 'high' ? 'text-yellow-600' : 'text-yellow-700'}`}>
                      {formatCurrency(forecast.nextMonth)}
                    </div>
                    <div className="text-xs text-gray-600">Prévision</div>
                    <div className="text-xs font-medium text-gray-700">Prochain mois</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Modal d'analyse complète */}
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Analyse Complète des Ventes</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Tendances */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Tendances</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-xl font-bold text-orange-600">
                      {stats.avgGrowth >= 0 ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                    </div>
                    <div className="text-sm text-gray-600">Tendance</div>
                    <div className={`text-base font-semibold ${stats.avgGrowth >= 0 ? 'text-orange-600' : 'text-orange-700'}`}>
                      {stats.avgGrowth >= 0 ? 'Croissante' : 'Décroissante'}
                    </div>
                  </div>

                  <div className="text-center p-4 bg-orange-100 rounded-lg">
                    <div className="text-xl font-bold text-orange-600">
                      {formatCurrency(stats.avgSales)}
                  </div>
                    <div className="text-sm text-gray-600">CA Moyen</div>
                    <div className="text-xs text-gray-500">par mois</div>
                </div>

                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-xl font-bold text-orange-600">
                      {formatNumber(Math.round(stats.totalUnits / extendedData.length))}
                    </div>
                    <div className="text-sm text-gray-600">Unités Moyennes</div>
                    <div className="text-xs text-gray-500">par mois</div>
                  </div>
                </div>
              </div>

              {/* Saisonnalité */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Analyse Saisonnière</h4>
                <div className="grid grid-cols-4 gap-4">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, index) => {
                    const quarterData = extendedData.slice(index * 3, (index + 1) * 3);
                    const quarterSales = quarterData.reduce((sum, item) => sum + item.sales, 0);
                    const quarterUnits = quarterData.reduce((sum, item) => sum + item.units, 0);

                    return (
                      <div key={quarter} className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-base font-bold text-gray-900">{quarter}</div>
                        <div className="text-sm text-gray-600">{formatCurrency(quarterSales)}</div>
                        <div className="text-xs text-gray-500">{formatNumber(quarterUnits)} unités</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Prévisions */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Prévisions</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-base font-bold text-orange-600">
                      {formatCurrency(stats.avgSales * 1.05)}
                    </div>
                    <div className="text-sm text-gray-600">Prévision optimiste</div>
                    <div className="text-xs text-gray-500">+5% de croissance</div>
                  </div>

                  <div className="text-center p-4 bg-orange-100 rounded-lg">
                    <div className="text-base font-bold text-orange-600">
                      {formatCurrency(stats.avgSales)}
                    </div>
                    <div className="text-sm text-gray-600">Prévision stable</div>
                    <div className="text-xs text-gray-500">Même niveau</div>
                  </div>

                  <div className="text-center p-4 bg-orange-200 rounded-lg">
                    <div className="text-base font-bold text-orange-700">
                      {formatCurrency(stats.avgSales * 0.95)}
                    </div>
                    <div className="text-sm text-gray-600">Prévision pessimiste</div>
                    <div className="text-xs text-gray-500">-5% de croissance</div>
                  </div>
                </div>
              </div>

              {/* Recommandations */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Recommandations</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Maintenir la croissance</div>
                      <div className="text-sm text-orange-700">Continuer les stratégies qui ont fonctionné ces derniers mois</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-orange-100 rounded-lg">
                    <div className="w-2 h-2 bg-orange-600 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Optimiser les mois faibles</div>
                      <div className="text-sm text-orange-700">Développer des promotions pour les périodes de faible activité</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Analyser la saisonnalité</div>
                      <div className="text-sm text-orange-700">Adapter l'inventaire selon les tendances saisonnières</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prévisions détaillées */}
      {showForecast && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Prévisions Détaillées</h3>
              <button
                onClick={() => setShowForecast(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Prévisions mensuelles */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Prévisions Mensuelles</h4>
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const forecast = generateForecast();
                    const nextMonths = [
                      { month: 'Prochain mois', value: forecast.nextMonth, confidence: forecast.confidence },
                      { month: 'Dans 2 mois', value: forecast.nextMonth * 1.05, confidence: 'medium' },
                      { month: 'Dans 3 mois', value: forecast.nextMonth * 1.1, confidence: 'low' }
                    ];

                    return nextMonths.map((item, index) => (
                      <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-base font-bold text-gray-900">{formatCurrency(item.value)}</div>
                        <div className="text-sm text-gray-600">{item.month}</div>
                        <div className={`text-xs font-medium ${
                          item.confidence === 'high' ? 'text-orange-600' :
                          item.confidence === 'medium' ? 'text-orange-700' : 'text-orange-800'
                        }`}>
                          Confiance: {item.confidence === 'high' ? 'Élevée' : item.confidence === 'medium' ? 'Moyenne' : 'Faible'}
                  </div>
                  </div>
                    ));
                  })()}
                  </div>
                </div>

              {/* Prévisions trimestrielles */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Prévisions Trimestrielles</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <h5 className="font-semibold text-orange-800 mb-2">Q1 2025</h5>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(stats.avgSales * 3)}</div>
                    <div className="text-sm text-orange-700">Basé sur les tendances actuelles</div>
              </div>
                  <div className="p-4 bg-orange-100 rounded-lg">
                    <h5 className="font-semibold text-orange-800 mb-2">Q2 2025</h5>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(stats.avgSales * 3.15)}</div>
                    <div className="text-sm text-orange-700">Avec croissance saisonnière</div>
                  </div>
                </div>
              </div>

              {/* Facteurs d'influence */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Facteurs d'Influence</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Saisonnalité</span>
                    <span className="text-sm text-orange-600 font-semibold">+12%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Marché en croissance</span>
                    <span className="text-sm text-orange-600 font-semibold">+8%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-100 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Concurrence</span>
                    <span className="text-sm text-orange-700 font-semibold">-3%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Économie générale</span>
                    <span className="text-sm text-orange-600 font-semibold">±2%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prévision IA */}
      {showAIForecast && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">🤖 Prévision IA Avancée</h3>
              <button
                onClick={() => setShowAIForecast(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Prévision Q1 2025</h5>
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(forecasts.realistic * 3 * 1.12)}</div>
                  <div className="text-xs text-orange-700">+12% vs Q4 2024</div>
                  <div className="text-xs text-orange-600 mt-2">Confiance IA: 78%</div>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Facteurs d'influence</h5>
                  <ul className="text-xs text-orange-700 space-y-1">
                    <li>• Saisonnalité: +8%</li>
                    <li>• Marché: +3%</li>
                    <li>• Concurrence: -2%</li>
                    <li>• Innovation: +3%</li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                <h5 className="text-sm font-semibold text-orange-800 mb-2">Recommandations IA</h5>
                <div className="text-sm text-orange-700 space-y-2">
                  <div>• Augmenter le stock des engins compacts de 15%</div>
                  <div>• Lancer une campagne promotionnelle en février</div>
                  <div>• Former l'équipe commerciale sur les nouveaux modèles</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de benchmark secteur */}
      {showBenchmark && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">📊 Benchmark Secteur</h3>
              <button
                onClick={() => setShowBenchmark(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Vue d'ensemble */}
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.sectorAverage || 0)}</div>
                  <div className="text-sm text-gray-600">Moyenne secteur</div>
                </div>
                <div className="text-center p-4 bg-orange-100 rounded-lg border border-orange-300">
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.top25Percent || 0)}</div>
                  <div className="text-sm text-gray-600">Top 25%</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.yourPerformance || 0)}</div>
                  <div className="text-sm text-gray-600">Votre performance</div>
                </div>
                <div className="text-center p-4 bg-orange-100 rounded-lg border border-orange-300">
                  <div className="text-lg font-bold text-orange-600">Top {benchmarkData.sectorRank || 0}%</div>
                  <div className="text-sm text-gray-600">Votre rang</div>
                </div>
              </div>

              {/* Comparaison détaillée */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Comparaison Détaillée</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Écart vs moyenne secteur</span>
                    <span className={`text-sm font-semibold ${(benchmarkData.performanceGap || 0) >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                      {(benchmarkData.performanceGap || 0) >= 0 ? '+' : ''}{(benchmarkData.performanceGap || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-100 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Écart vs top 25%</span>
                    <span className={`text-sm font-semibold ${(benchmarkData.top25Gap || 0) <= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                      {(benchmarkData.top25Gap || 0) <= 0 ? '+' : ''}{-(benchmarkData.top25Gap || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Données sectorielles simulées */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Données Sectorielles</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-orange-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-orange-800">Mois</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-orange-800">Moyenne secteur</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-orange-800">Votre CA</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-orange-800">Écart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100">
                      {sectorBenchmarkData.map((item, index) => (
                        <tr key={index} className="hover:bg-orange-50">
                          <td className="px-4 py-2 text-sm text-gray-900">{item.month}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.sectorAvg)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.companySales)}</td>
                          <td className={`px-4 py-2 text-sm text-right font-medium ${item.difference >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                            {item.difference >= 0 ? '+' : ''}{item.difference}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recommandations de benchmark */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Recommandations</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Maintenir l'avantage concurrentiel</div>
                      <div className="text-sm text-orange-700">Vous êtes dans le top 15% du secteur. Continuez vos stratégies gagnantes.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-orange-100 rounded-lg">
                    <div className="w-2 h-2 bg-orange-600 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Optimiser les prix</div>
                      <div className="text-sm text-orange-700">Augmenter les prix de 5-7% pour optimiser la marge tout en restant compétitif.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium text-orange-800">Élargir la gamme</div>
                      <div className="text-sm text-orange-700">Développer de nouveaux produits pour capturer plus de parts de marché.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'analyse IA */}
      {showAIAnalysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">🤖 Analyse IA Complète</h3>
              <button
                onClick={() => setShowAIAnalysis(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Insights détaillés */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Insights Détaillés</h4>
                <div className="space-y-4">
                  {aiInsights.map((insight) => (
                    <div key={insight.id} className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            insight.impact === 'high' ? 'bg-red-500' : 
                            insight.impact === 'medium' ? 'bg-orange-500' : 'bg-orange-500'
                          }`}></div>
                          <h5 className="font-semibold text-orange-800">{insight.title}</h5>
                        </div>
                        <div className="text-xs text-orange-600 font-medium">{insight.estimatedGain}</div>
                      </div>
                      <p className="text-sm text-orange-700 mb-3">{insight.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-orange-600">
                          Confiance: {insight.confidence}%
                        </div>
                        <button
                          onClick={() => handleInsightAction(insight)}
                          disabled={actionLoading === `insight-${insight.id}`}
                          className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
                        >
                          {actionLoading === `insight-${insight.id}` ? 'Application...' : insight.action}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analyse des tendances IA */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Analyse des Tendances IA</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <h5 className="text-sm font-semibold text-orange-800 mb-2">Tendance des prix</h5>
                    <div className="text-lg font-bold text-orange-600">+8%</div>
                    <div className="text-xs text-orange-700">Augmentation recommandée</div>
                  </div>
                  <div className="p-4 bg-orange-100 rounded-lg border border-orange-300">
                    <h5 className="text-sm font-semibold text-orange-800 mb-2">Demande saisonnière</h5>
                    <div className="text-lg font-bold text-orange-600">+15%</div>
                    <div className="text-xs text-orange-700">Q1 2025 attendu</div>
                  </div>
                </div>
              </div>

              {/* Actions recommandées */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Actions Recommandées</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div>
                      <div className="font-medium text-orange-800">Ajuster les prix</div>
                      <div className="text-sm text-orange-700">Augmentation de 5-7% sur la gamme premium</div>
                    </div>
                    <button className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700">
                      Appliquer
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-100 rounded-lg">
                    <div>
                      <div className="font-medium text-orange-800">Lancer promotion</div>
                      <div className="text-sm text-orange-700">Campagne "Fin d'été" pour les mois faibles</div>
                    </div>
                    <button className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700">
                      Planifier
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div>
                      <div className="font-medium text-orange-800">Élargir catalogue</div>
                      <div className="text-sm text-orange-700">Ajouter plus d'engins compacts</div>
                    </div>
                    <button className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700">
                      Analyser
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de benchmark */}
      {showBenchmark && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">📊 Benchmark Secteur</h3>
              <button
                onClick={() => setShowBenchmark(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Moyenne Secteur</h5>
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.sectorAverage || 0)}</div>
                  <div className="text-xs text-orange-700">CA mensuel moyen</div>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Top 25%</h5>
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.top25Percent || 0)}</div>
                  <div className="text-xs text-orange-700">Seuil d'excellence</div>
                </div>
                <div className="bg-orange-200 p-4 rounded-lg border border-orange-400">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Votre Performance</h5>
                  <div className="text-lg font-bold text-orange-600">{formatCurrency(benchmarkData.yourPerformance || 0)}</div>
                  <div className="text-xs text-orange-700">CA mensuel moyen</div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Position Secteur</h5>
                  <div className="text-lg font-bold text-orange-600">Top {benchmarkData.sectorRank || 0}%</div>
                  <div className="text-sm text-orange-700">
                    Vous êtes dans les {benchmarkData.sectorRank || 0}% meilleurs du secteur
                  </div>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                  <h5 className="text-sm font-semibold text-orange-800 mb-2">Écart vs Secteur</h5>
                  <div className={`text-lg font-bold ${(benchmarkData.performanceGap || 0) >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                    {(benchmarkData.performanceGap || 0) >= 0 ? '+' : ''}{(benchmarkData.performanceGap || 0).toFixed(1)}%
                  </div>
                  <div className="text-sm text-orange-700">
                    {(benchmarkData.performanceGap || 0) >= 0 ? 'Au-dessus' : 'En-dessous'} de la moyenne secteur
                  </div>
                </div>
              </div>

              {/* Graphique de comparaison */}
              <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h5 className="text-sm font-semibold text-orange-800 mb-4">Comparaison Mensuelle</h5>
                <div className="space-y-3">
                  {sectorBenchmarkData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-orange-700">{item.month}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-orange-600">{formatCurrency(item.sectorAvg)}</span>
                        <div className="w-32 bg-orange-200 rounded-full h-2">
                          <div 
                            className="bg-orange-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(100, (item.companySales / item.sectorAvg) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-orange-600">+{item.difference}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'insights IA */}
      {showAIAnalysis && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">🤖 Insights IA</h3>
              <button
                onClick={() => setShowAIAnalysis(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {aiInsights.map((insight) => (
                  <div key={insight.id} className="bg-gradient-to-r from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-3 h-3 rounded-full ${
                            insight.impact === 'high' ? 'bg-red-500' : 
                            insight.impact === 'medium' ? 'bg-orange-500' : 'bg-green-500'
                          }`}></div>
                          <h5 className="text-sm font-semibold text-orange-800">{insight.title}</h5>
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                            {insight.confidence}% confiance
                          </span>
                        </div>
                        <p className="text-sm text-orange-700 mb-2">{insight.description}</p>
                        <div className="text-sm font-medium text-orange-600 mb-3">{insight.estimatedGain}</div>
                        <div className="text-sm text-orange-700">
                          <strong>Action recommandée:</strong> {insight.action}
                        </div>
                      </div>
                      <button
                        onClick={() => handleInsightAction(insight)}
                        disabled={actionLoading === `insight-${insight.id}`}
                        className="ml-4 px-4 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50"
                      >
                        {actionLoading === `insight-${insight.id}` ? 'Application...' : 'Appliquer'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 bg-orange-50 p-4 rounded-lg border border-orange-200">
                <h5 className="text-sm font-semibold text-orange-800 mb-2">💡 Résumé des Opportunités</h5>
                <div className="text-sm text-orange-700 space-y-1">
                  <div>• Gain potentiel total: +35% CA</div>
                  <div>• Actions prioritaires: 3</div>
                  <div>• Impact estimé: Élevé</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
