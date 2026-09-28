import React, { useState, useEffect } from 'react';
import { Widget } from '../../constants/dashboardTypes';
import { getWidgetData } from '../../constants/mockData';
import { supabaseClient } from '../../utils/supabaseClient';
import {
  getRentalRevenue,
  getUpcomingRentals,
  getRentalOverdue,
  updateRentalStatus,
} from '../../utils/enterpriseApi/rentals';
import { toast } from '../../utils/toast';
import { getEquipmentAvailability } from '../../utils/enterpriseApi/equipment';
import { buildCorrelatedRentalActions } from '../../utils/buildCorrelatedRentalActions';
import { getDailyInterventions } from '../../utils/enterpriseApi/interventions';
import { getRepairsStatus } from '../../utils/enterpriseApi/repairs';
import { getInventoryStatus, createStockOrder } from '../../utils/enterpriseApi/inventory';
import { getTechniciansWorkload } from '../../utils/enterpriseApi/technicians';
import QuickInterventionForm from './widgets/QuickInterventionForm';
import QuickDeliveryForm from './widgets/QuickDeliveryForm';
import DeliveryMap from './widgets/DeliveryMap';
import {
  getActiveDeliveries,
  getDeliveryMapData,
  getTransportCosts,
  getDriverSchedule,
  getDeadheadCost,
} from '../../utils/enterpriseApi/transport';
import {
  getCommissionTracking,
  getClientPortfolio,
  getPerformanceAnalytics,
  getBankComparison,
} from '../../utils/enterpriseApi/courtier';
import CreditApplicationsWidget from './widgets/CreditApplicationsWidget';
import InsurancePoliciesWidget from './widgets/InsurancePoliciesWidget';
import {
  getPortfolioValue,
  getInvestmentOpportunities,
  getRoiAnalysis,
  getRiskAssessment,
  getOpportunitiesScore,
  getYieldRealizedVsExpected,
  convertOpportunityToInvestment,
  type OpportunityRow,
} from '../../utils/enterpriseApi/investisseur';
import QuickInvestmentForm from './widgets/QuickInvestmentForm';
import QuickOpportunityForm from './widgets/QuickOpportunityForm';
import FreightContainerMap from './widgets/FreightContainerMap';
import {
  getCustomsClearanceMetrics,
  getContainerTrackingRows,
  getImportExportStats,
  getFreightDocumentsForList,
  getDemurrageExposure,
} from '../../utils/enterpriseApi/transitaire';
import LogisticsRoutesMap from './widgets/LogisticsRoutesMap';
import {
  getWarehouseOccupancyMetrics,
  getRouteTrackingRows,
  getSupplyChainKpisChart,
  getLogisticsStockAlertsList,
  getLogisticsProfitability,
} from '../../utils/enterpriseApi/logisticien';
import { Plus, ShoppingCart, Truck, Package, AlertTriangle, Clock, Shield, FileText, DollarSign, RefreshCw, Building2, Target, TrendingUp, Briefcase, ArrowRight, Ship, Anchor, Landmark, Wallet } from 'lucide-react';

// Import des widgets avancés avec IA
import SalesPerformanceScoreWidget from './widgets/SalesPerformanceScoreWidget';
import SalesPipelineWidget from './widgets/SalesPipelineWidget';
import SalesEvolutionWidgetEnriched from '../../components/SalesEvolutionWidgetEnriched';
import DailyActionsPriorityWidget from './widgets/DailyActionsPriorityWidget';

// Import des widgets IA
import AIInsightsWidget from './widgets/AIInsightsWidget';
import AIOptimizationWidget from './widgets/AIOptimizationWidget';

// Import des widgets basiques (fallback)
import MetricWidget from './widgets/MetricWidget';
import ChartWidget from './widgets/ChartWidget';
import ListWidget from './widgets/ListWidget';
import ContainerTrackingWidget from './widgets/ContainerTrackingWidget';
import DeliveryMapWidget from './widgets/DeliveryMapWidget';
import PortfolioValueWidget from './widgets/PortfolioValueWidget';
import WarehouseOccupancyWidget from './widgets/WarehouseOccupancyWidget';
import CustomsClearanceWidget from './widgets/CustomsClearanceWidget';
import YieldRealizedVsExpectedWidget from './widgets/YieldRealizedVsExpectedWidget';
import BankComparatorWidget from './widgets/BankComparatorWidget';
import DeadheadCostWidget from './widgets/DeadheadCostWidget';
import LogisticsProfitabilityWidget from './widgets/LogisticsProfitabilityWidget';
import RentalOverdueWidget from './widgets/RentalOverdueWidget';
import DemurrageTrackingWidget from './widgets/DemurrageTrackingWidget';
import ImportExportStatsWidget from './widgets/ImportExportStatsWidget';
import RiskAssessmentWidget from './widgets/RiskAssessmentWidget';
import RoiAnalysisWidget from './widgets/RoiAnalysisWidget';
import TransportCostsWidget from './widgets/TransportCostsWidget';
import TechnicianWorkloadWidget from './widgets/TechnicianWorkloadWidget';
import PartsInventoryWidget from './widgets/PartsInventoryWidget';
import InterventionsTodayWidget from './widgets/InterventionsTodayWidget';
import PerformanceAnalyticsWidget from './widgets/PerformanceAnalyticsWidget';
import CommissionTrackingWidget from './widgets/CommissionTrackingWidget';
import ClientPortfolioWidget from './widgets/ClientPortfolioWidget';
import { InventoryStatusWidget } from '../../pages/enterprise/widgets/InventoryStatusWidget';
import PerformanceWidget from './widgets/PerformanceWidget';
import StockStatusWidget from './widgets/StockStatusWidget';
import EquipmentAvailabilityWidget from './widgets/EquipmentAvailabilityWidget';
import UpcomingRentalsWidget from './widgets/UpcomingRentalsWidget';
import TransactionCasesWidget from './widgets/TransactionCasesWidget';

// Import des widgets spécialisés pour vendeur
// Les composants React ont été supprimés du fichier VendeurWidgets.tsx
// car seuls les widgets de configuration sont maintenant utilisés

interface WidgetRendererProps {
  widget: Widget;
  widgetSize?: 'small' | 'medium' | 'large';
  onAction?: (action: string, data: any) => void;
  /** Rôle du tableau ouvert dans EnterpriseDashboardShell (ex. loueur, vendeur). Évite de dépendre uniquement de lastActiveMetier. */
  dashboardRole?: string;
}

// Fonctions pures de traduction API -> widgets : sorties dans leur propre
// fichier, ou elles sont enfin testables (widgetRendererMappers.test.ts).
import {
  getFontSizeFromWidgetSize,
  mapLoueurStatusForCalendar,
  mapUpcomingRentalsForWidget,
  mapRepairsForList,
  mapInventoryForChart,
  mapWorkloadForChart,
  mapEquipmentAvailabilityForWidget,
} from './widgetRendererMappers';

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ 
  widget, 
  widgetSize = 'medium',
  onAction,
  dashboardRole,
}) => {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedUserIdLoading, setResolvedUserIdLoading] = useState(true);

  const [liveRentalRevenue, setLiveRentalRevenue] = useState<{
    revenue: number;
    count: number;
    growth: number;
  } | null>(null);
  const [liveRentalRevenueLoading, setLiveRentalRevenueLoading] = useState(false);

  const [liveUpcomingRentals, setLiveUpcomingRentals] = useState<
    ReturnType<typeof mapUpcomingRentalsForWidget> | null
  >(null);
  const [liveUpcomingRentalsLoading, setLiveUpcomingRentalsLoading] = useState(false);

  const [liveEquipmentAvail, setLiveEquipmentAvail] = useState<
    ReturnType<typeof mapEquipmentAvailabilityForWidget> | null
  >(null);
  const [liveEquipmentAvailLoading, setLiveEquipmentAvailLoading] = useState(false);

  const [loueurDailyActions, setLoueurDailyActions] = useState<any[] | null>(null);
  const [loueurDailyActionsLoading, setLoueurDailyActionsLoading] = useState(false);

  // --- MECANICIEN : 4 widgets data live ---

  const [liveRepairs, setLiveRepairs] = useState<ReturnType<typeof mapRepairsForList> | null>(null);
  const [liveRepairsLoading, setLiveRepairsLoading] = useState(false);



  // --- MECANICIEN : modales actions rapides ---

  // --- TRANSPORTEUR : 4 widgets data live ---
  const [liveActiveDeliveries, setLiveActiveDeliveries] = useState<
    Awaited<ReturnType<typeof getActiveDeliveries>> | null
  >(null);
  const [liveActiveDeliveriesLoading, setLiveActiveDeliveriesLoading] = useState(false);



  const [liveDriverSchedule, setLiveDriverSchedule] = useState<
    Awaited<ReturnType<typeof getDriverSchedule>> | null
  >(null);
  const [liveDriverScheduleLoading, setLiveDriverScheduleLoading] = useState(false);

  const [showDeliveryForm, setShowDeliveryForm] = useState(false);

  // --- COURTIER : 5 widgets data live ---


  // --- INVESTISSEUR : 5 widgets data live ---
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunityRow[] | null>(null);
  const [liveOpportunitiesLoading, setLiveOpportunitiesLoading] = useState(false);
  const [liveOpportunitiesScore, setLiveOpportunitiesScore] = useState<
    Awaited<ReturnType<typeof getOpportunitiesScore>> | null
  >(null);
  const [liveOpportunitiesScoreLoading, setLiveOpportunitiesScoreLoading] = useState(false);

  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [convertingOpportunityId, setConvertingOpportunityId] = useState<string | null>(null);

  // --- TRANSITAIRE (douane / conteneurs / I-E / documents) ---
  const [liveFreightDocuments, setLiveFreightDocuments] = useState<
    Awaited<ReturnType<typeof getFreightDocumentsForList>> | null
  >(null);
  const [liveFreightDocumentsLoading, setLiveFreightDocumentsLoading] = useState(false);

  // --- LOGISTICIEN / SUPPLY CHAIN ---
  const [liveRouteTracking, setLiveRouteTracking] = useState<
    Awaited<ReturnType<typeof getRouteTrackingRows>> | null
  >(null);
  const [liveRouteTrackingLoading, setLiveRouteTrackingLoading] = useState(false);
  const [liveSupplyChainKpis, setLiveSupplyChainKpis] = useState<
    Awaited<ReturnType<typeof getSupplyChainKpisChart>> | null
  >(null);
  const [liveSupplyChainKpisLoading, setLiveSupplyChainKpisLoading] = useState(false);
  const [liveLogisticsStockAlerts, setLiveLogisticsStockAlerts] = useState<
    Awaited<ReturnType<typeof getLogisticsStockAlertsList>> | null
  >(null);
  const [liveLogisticsStockAlertsLoading, setLiveLogisticsStockAlertsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveUser = async () => {
      try {
        const { data } = await supabaseClient.auth.getSession();
        const id = data.session?.user?.id ?? null;
        if (!cancelled) setResolvedUserId(id);
      } catch (err) {
        console.error('WidgetRenderer: failed to resolve user id', err);
        if (!cancelled) setResolvedUserId(null);
      } finally {
        if (!cancelled) setResolvedUserIdLoading(false);
      }
    };

    resolveUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (widget.id !== 'rental-revenue') return;
    let cancelled = false;
    (async () => {
      setLiveRentalRevenueLoading(true);
      try {
        const rev = await getRentalRevenue();
        if (!cancelled) setLiveRentalRevenue(rev);
      } catch (e) {
        console.error('WidgetRenderer getRentalRevenue', e);
        if (!cancelled) setLiveRentalRevenue({ revenue: 0, count: 0, growth: 0 });
      } finally {
        if (!cancelled) setLiveRentalRevenueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'upcoming-rentals') return;
    let cancelled = false;
    (async () => {
      setLiveUpcomingRentalsLoading(true);
      try {
        const rows = await getUpcomingRentals();
        if (!cancelled) setLiveUpcomingRentals(mapUpcomingRentalsForWidget(rows));
      } catch (e) {
        console.error('WidgetRenderer getUpcomingRentals', e);
        if (!cancelled) setLiveUpcomingRentals([]);
      } finally {
        if (!cancelled) setLiveUpcomingRentalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'equipment-availability') return;
    let cancelled = false;
    (async () => {
      setLiveEquipmentAvailLoading(true);
      try {
        const pack = await getEquipmentAvailability();
        if (!cancelled) setLiveEquipmentAvail(mapEquipmentAvailabilityForWidget(pack.details || []));
      } catch (e) {
        console.error('WidgetRenderer getEquipmentAvailability', e);
        if (!cancelled) setLiveEquipmentAvail([]);
      } finally {
        if (!cancelled) setLiveEquipmentAvailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

  const effectiveMetier =
    (dashboardRole && dashboardRole.trim()) || (typeof localStorage !== 'undefined' ? localStorage.getItem('lastActiveMetier') : null);
  const isLoueurContext =
    ['rental-revenue', 'equipment-availability', 'upcoming-rentals', 'rental-pipeline', 'daily-actions'].includes(widget.id) &&
    effectiveMetier === 'loueur';

  useEffect(() => {
    if (widget.id !== 'daily-actions' || !isLoueurContext) return;
    let cancelled = false;
    (async () => {
      setLoueurDailyActionsLoading(true);
      try {
        const actions = await buildCorrelatedRentalActions();
        if (!cancelled) setLoueurDailyActions(actions);
      } catch {
        if (!cancelled) setLoueurDailyActions([]);
      } finally {
        if (!cancelled) setLoueurDailyActionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id, isLoueurContext, dashboardRole]);

  useEffect(() => {
    const refresh = () => {
      if (widget.id === 'rental-revenue') {
        getRentalRevenue()
          .then((rev) => setLiveRentalRevenue(rev))
          .catch(() => {});
      }
      if (widget.id === 'upcoming-rentals') {
        getUpcomingRentals()
          .then((rows) => setLiveUpcomingRentals(mapUpcomingRentalsForWidget(rows)))
          .catch(() => {});
      }
      if (widget.id === 'equipment-availability') {
        getEquipmentAvailability()
          .then((pack) => setLiveEquipmentAvail(mapEquipmentAvailabilityForWidget(pack.details || [])))
          .catch(() => {});
      }
      if (widget.id === 'daily-actions' && isLoueurContext) {
        buildCorrelatedRentalActions()
          .then((a) => setLoueurDailyActions(a))
          .catch(() => {});
      }
      if (widget.id === 'repair-status') {
        getRepairsStatus()
          .then((rows) => setLiveRepairs(mapRepairsForList(rows)))
          .catch(() => {});
      }
      if (widget.id === 'active-deliveries') {
        getActiveDeliveries().then(setLiveActiveDeliveries).catch(() => {});
      }
      if (widget.id === 'driver-schedule') {
        getDriverSchedule().then(setLiveDriverSchedule).catch(() => {});
      }
      if (widget.id === 'investment-opportunities') {
        getInvestmentOpportunities().then(setLiveOpportunities).catch(() => {});
      }
      if (widget.id === 'opportunities') {
        getOpportunitiesScore().then(setLiveOpportunitiesScore).catch(() => {});
      }
      if (widget.id === 'document-status') {
        getFreightDocumentsForList().then(setLiveFreightDocuments).catch(() => {});
      }
      if (widget.id === 'route-optimization') {
        getRouteTrackingRows().then(setLiveRouteTracking).catch(() => {});
      }
      if (widget.id === 'supply-chain-kpis') {
        getSupplyChainKpisChart().then(setLiveSupplyChainKpis).catch(() => {});
      }
      if (widget.id === 'inventory-alerts') {
        getLogisticsStockAlertsList().then(setLiveLogisticsStockAlerts).catch(() => {});
      }
    };
    window.addEventListener('pipeline:refresh', refresh);
    return () => window.removeEventListener('pipeline:refresh', refresh);
  }, [widget.id, isLoueurContext, dashboardRole]);

  // --- MECANICIEN : repair-status ---
  useEffect(() => {
    if (widget.id !== 'repair-status') return;
    let cancelled = false;
    (async () => {
      setLiveRepairsLoading(true);
      try {
        const rows = await getRepairsStatus();
        if (!cancelled) setLiveRepairs(mapRepairsForList(rows));
      } catch (e) {
        console.error('WidgetRenderer getRepairsStatus', e);
        if (!cancelled) setLiveRepairs([]);
      } finally {
        if (!cancelled) setLiveRepairsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

  // --- TRANSPORTEUR : active-deliveries ---
  useEffect(() => {
    if (widget.id !== 'active-deliveries') return;
    let cancelled = false;
    (async () => {
      setLiveActiveDeliveriesLoading(true);
      try {
        const data = await getActiveDeliveries();
        if (!cancelled) setLiveActiveDeliveries(data);
      } catch (e) {
        console.error('WidgetRenderer getActiveDeliveries', e);
        if (!cancelled) setLiveActiveDeliveries({ total: 0, inProgress: 0, planned: 0, delayed: 0, urgent: 0, rows: [] });
      } finally {
        if (!cancelled) setLiveActiveDeliveriesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- TRANSPORTEUR : driver-schedule ---
  useEffect(() => {
    if (widget.id !== 'driver-schedule') return;
    let cancelled = false;
    (async () => {
      setLiveDriverScheduleLoading(true);
      try {
        const data = await getDriverSchedule();
        if (!cancelled) setLiveDriverSchedule(data);
      } catch (e) {
        console.error('WidgetRenderer getDriverSchedule', e);
        if (!cancelled) setLiveDriverSchedule([]);
      } finally {
        if (!cancelled) setLiveDriverScheduleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- INVESTISSEUR : investment-opportunities ---
  useEffect(() => {
    if (widget.id !== 'investment-opportunities') return;
    let cancelled = false;
    (async () => {
      setLiveOpportunitiesLoading(true);
      try {
        const data = await getInvestmentOpportunities();
        if (!cancelled) setLiveOpportunities(data);
      } catch (e) {
        console.error('WidgetRenderer getInvestmentOpportunities', e);
        if (!cancelled) setLiveOpportunities([]);
      } finally {
        if (!cancelled) setLiveOpportunitiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- INVESTISSEUR : opportunities (metric) ---
  useEffect(() => {
    if (widget.id !== 'opportunities') return;
    let cancelled = false;
    (async () => {
      setLiveOpportunitiesScoreLoading(true);
      try {
        const data = await getOpportunitiesScore();
        if (!cancelled) setLiveOpportunitiesScore(data);
      } catch (e) {
        console.error('WidgetRenderer getOpportunitiesScore', e);
      } finally {
        if (!cancelled) setLiveOpportunitiesScoreLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'document-status') return;
    let cancelled = false;
    (async () => {
      setLiveFreightDocumentsLoading(true);
      try {
        const data = await getFreightDocumentsForList();
        if (!cancelled) setLiveFreightDocuments(data);
      } catch (e) {
        console.error('WidgetRenderer getFreightDocumentsForList', e);
        if (!cancelled) setLiveFreightDocuments([]);
      } finally {
        if (!cancelled) setLiveFreightDocumentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'route-optimization') return;
    let cancelled = false;
    (async () => {
      setLiveRouteTrackingLoading(true);
      try {
        const data = await getRouteTrackingRows();
        if (!cancelled) setLiveRouteTracking(data);
      } catch (e) {
        console.error('WidgetRenderer getRouteTrackingRows', e);
        if (!cancelled) setLiveRouteTracking([]);
      } finally {
        if (!cancelled) setLiveRouteTrackingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'supply-chain-kpis') return;
    let cancelled = false;
    (async () => {
      setLiveSupplyChainKpisLoading(true);
      try {
        const data = await getSupplyChainKpisChart();
        if (!cancelled) setLiveSupplyChainKpis(data);
      } catch (e) {
        console.error('WidgetRenderer getSupplyChainKpisChart', e);
      } finally {
        if (!cancelled) setLiveSupplyChainKpisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'inventory-alerts') return;
    let cancelled = false;
    (async () => {
      setLiveLogisticsStockAlertsLoading(true);
      try {
        const data = await getLogisticsStockAlertsList();
        if (!cancelled) setLiveLogisticsStockAlerts(data);
      } catch (e) {
        console.error('WidgetRenderer getLogisticsStockAlertsList', e);
        if (!cancelled) setLiveLogisticsStockAlerts([]);
      } finally {
        if (!cancelled) setLiveLogisticsStockAlertsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  const rawData = getWidgetData(widget.id, widget.dataSource);

  const handleWidgetAction = async (action: string, actionData: any) => {
    // Locations : « Confirmer » persiste réellement le statut (rentals.status),
    // puis rafraîchit la liste via l'événement pipeline:refresh.
    if (action === 'confirm' && actionData?.id) {
      const saved = await updateRentalStatus(String(actionData.id), 'confirmed');
      if (saved) {
        toast('✅ Location confirmée');
        window.dispatchEvent(new Event('pipeline:refresh'));
      }
      return;
    }
    onAction?.(action, actionData);
  };

  // Rendre le widget approprié selon son type et ID
  switch (widget.type) {
    // Widgets IA - Priorité haute
    case 'ai-insights':
      if (resolvedUserIdLoading) {
        return (
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
            <span className="ml-2 text-gray-600 text-sm">Chargement...</span>
          </div>
        );
      }
      if (!resolvedUserId) {
        return (
          <div className="p-4 text-sm text-gray-600">
            Connectez-vous pour afficher les insights IA.
          </div>
        );
      }
      return (
        <AIInsightsWidget 
          userId={resolvedUserId}
          widgetSize={widgetSize}
        />
      );

    case 'ai-optimization':
      if (resolvedUserIdLoading) {
        return (
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
            <span className="ml-2 text-gray-600 text-sm">Chargement...</span>
          </div>
        );
      }
      if (!resolvedUserId) {
        return (
          <div className="p-4 text-sm text-gray-600">
            Connectez-vous pour afficher les recommandations IA.
          </div>
        );
      }
      return (
        <AIOptimizationWidget 
          userId={resolvedUserId}
          widgetSize={widgetSize}
        />
      );

    // Widgets avancés avec IA - Priorité haute
    case 'performance':
      if (widget.id === 'sales-performance-score' || widget.id === 'rental-performance-score') {
        return <SalesPerformanceScoreWidget />;
      }
      return (
        <PerformanceWidget 
          widget={widget} 
          widgetSize={widgetSize as any}
          onShowDetails={() => {}}
        />
      );

    case 'chart':
      if (widget.id === 'sales-evolution' || widget.id === 'rental-evolution') {
        return <SalesEvolutionWidgetEnriched widgetSize={widgetSize as 'small' | 'medium' | 'large'} />;
      }
      if (widget.id === 'interventions-today') {
        return <InterventionsTodayWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'parts-inventory') {
        return <PartsInventoryWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'technician-workload') {
        return <TechnicianWorkloadWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'performance-analytics') {
        return <PerformanceAnalyticsWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'transport-costs') {
        return <TransportCostsWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'roi-analysis') {
        return <RoiAnalysisWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'risk-assessment') {
        return <RiskAssessmentWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'import-export-stats') {
        return <ImportExportStatsWidget widget={widget} widgetSize={widgetSize} />;
      }
      if (widget.id === 'supply-chain-kpis') {
        if (liveSupplyChainKpisLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mr-2" />
              Chargement des KPIs…
            </div>
          );
        }
        const k = liveSupplyChainKpis;
        if (!k || k.chartData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Target className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun KPI enregistré</div>
              <div className="text-xs text-gray-400 mt-1">
                Les indicateurs apparaîtront dès vos premières opérations logistiques
              </div>
            </div>
          );
        }
        const deltaColor = k.onTimeDelta >= 0 ? 'text-emerald-700' : 'text-red-700';
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Target className="h-3.5 w-3.5 text-emerald-600" />
                <span>Livraisons à temps (%)</span>
              </div>
              <span className={`text-xs font-bold ${deltaColor}`}>
                {k.onTimeDelta >= 0 ? '+' : ''}{k.onTimeDelta} pts vs m-1
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 px-1 pb-2 text-center">
              <div className="rounded bg-emerald-50 p-1.5">
                <div className="text-xs font-bold text-emerald-800">{k.latestOnTime}%</div>
                <div className="text-xs text-emerald-800/80">À temps</div>
              </div>
              <div className="rounded bg-teal-50 p-1.5">
                <div className="text-xs font-bold text-teal-800">{k.latestFillRate}%</div>
                <div className="text-xs text-teal-800/80">Remplissage</div>
              </div>
              <div className="rounded bg-orange-50 p-1.5">
                <div className="text-xs font-bold text-orange-800">{k.latestLeadDays}j</div>
                <div className="text-xs text-orange-800/80">Délai moy.</div>
              </div>
            </div>
            {k.latestIncidents > 0 && (
              <div className="mx-1 mb-1 rounded bg-red-50 px-2 py-0.5 text-center text-xs font-medium text-red-700">
                {k.latestIncidents} incident{k.latestIncidents > 1 ? 's' : ''} signalé{k.latestIncidents > 1 ? 's' : ''} (mois)
              </div>
            )}
            <div className="flex-1 min-h-0">
              <ChartWidget widget={widget} data={k.chartData as any[]} widgetSize={widgetSize as any} />
            </div>
          </div>
        );
      }
      return (
        <ChartWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
        />
      );

    case 'list':
      if (widget.id === 'demurrage-tracking') {
        return <DemurrageTrackingWidget />;
      }
      if (widget.id === 'rental-overdue') {
        return <RentalOverdueWidget />;
      }
      if (widget.id === 'logistics-profitability') {
        return <LogisticsProfitabilityWidget />;
      }
      if (widget.id === 'deadhead-cost') {
        return <DeadheadCostWidget />;
      }
      if (widget.id === 'bank-comparator') {
        return <BankComparatorWidget />;
      }
      if (widget.id === 'yield-realized-vs-expected') {
        return <YieldRealizedVsExpectedWidget />;
      }
      if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget />
          </div>
        );
      }
      if (widget.id === 'stock-status') {
        // Affiche le widget Plan d'action Stock & Revente
        return <StockStatusWidget />;
      }
      if (widget.id === 'repair-status') {
        if (liveRepairsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des réparations…
            </div>
          );
        }
        const repairsData = liveRepairs ?? [];
        if (repairsData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <div>Aucune réparation en cours</div>
              <div className="text-xs text-gray-400 mt-1">
                Atelier au calme — bonne nouvelle !
              </div>
            </div>
          );
        }
        return (
          <ListWidget
            widget={widget}
            data={repairsData as any}
            widgetSize={widgetSize as any}
            onAction={handleWidgetAction}
          />
        );
      }
      if (widget.id === 'credit-applications') {
        return <CreditApplicationsWidget />;
      }
      if (widget.id === 'insurance-policies') {
        return <InsurancePoliciesWidget />;
      }
      if (widget.id === 'client-portfolio') {
        return <ClientPortfolioWidget />;
      }
      if (widget.id === 'investment-opportunities') {
        const opps = liveOpportunities ?? [];
        const handleConvert = async (id: string) => {
          if (convertingOpportunityId) return;
          setConvertingOpportunityId(id);
          try {
            await convertOpportunityToInvestment(id);
            window.dispatchEvent(new CustomEvent('pipeline:refresh'));
          } catch { /* toast */ } finally { setConvertingOpportunityId(null); }
        };
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Target className="h-3.5 w-3.5 text-orange-600" />
                <span>{opps.length} opportunités</span>
              </div>
              <button
                type="button"
                onClick={() => setShowOpportunityForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
              >
                <Plus className="h-3 w-3" />
                Nouvelle opportunité
              </button>
            </div>
            {liveOpportunitiesLoading ? (
              <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
                Chargement…
              </div>
            ) : opps.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <div>Aucune opportunité active</div>
                <button
                  type="button"
                  onClick={() => setShowOpportunityForm(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                >
                  <Plus className="h-3 w-3" />
                  Première opportunité
                </button>
              </div>
            ) : (
              <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
                {opps.slice(0, 20).map((o) => {
                  const days = o.expiry_date
                    ? Math.round((new Date(o.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24))
                    : null;
                  const isExpiringSoon = days != null && days >= 0 && days <= 7;
                  const isExpired = days != null && days < 0;
                  const recoColor =
                    o.recommendation === 'Acheter' ? 'bg-green-100 text-green-700'
                    : o.recommendation === 'Étudier' ? 'bg-orange-100 text-orange-700'
                    : o.recommendation === 'Passer' ? 'bg-red-100 text-red-700'
                    : o.recommendation === 'Suivre' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700';
                  const riskColor =
                    Number(o.risk_score || 5) <= 4 ? 'text-green-600'
                    : Number(o.risk_score || 5) <= 6 ? 'text-orange-600'
                    : 'text-red-600';
                  return (
                    <div key={o.id} className="rounded border border-gray-200 bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-gray-900">
                            {o.equipment_label}
                            {o.year ? <span className="ml-1 text-gray-400">({o.year})</span> : null}
                          </div>
                          <div className="truncate text-xs text-gray-500">
                            {o.source}
                            {o.contact_name ? ` · ${o.contact_name}` : ''}
                            {o.reference ? ` · ${o.reference}` : ''}
                          </div>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${recoColor}`}>
                          {o.recommendation}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                        <span>
                          <span className="font-semibold text-gray-900">{Number(o.asking_price || 0).toLocaleString('fr-FR')} MAD</span>
                          {o.expected_roi_percent != null && (
                            <span className={`ml-2 font-bold ${o.expected_roi_percent >= 10 ? 'text-green-700' : o.expected_roi_percent >= 5 ? 'text-orange-700' : 'text-red-700'}`}>
                              ROI {o.expected_roi_percent}%
                            </span>
                          )}
                          {o.payback_months && <span className="ml-2 text-gray-500">PB {o.payback_months}m</span>}
                          <span className={`ml-2 ${riskColor}`}>R{o.risk_score}/10</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {(isExpiringSoon || isExpired) && (
                            <span className={`text-xs font-medium ${isExpired ? 'text-red-600' : 'text-amber-700'}`}>
                              {isExpired ? 'Expirée' : `${days}j`}
                            </span>
                          )}
                          {(o.recommendation === 'Acheter' || o.recommendation === 'Étudier') && o.status !== 'Convertie' && (
                            <button
                              type="button"
                              onClick={() => handleConvert(o.id)}
                              disabled={convertingOpportunityId === o.id}
                              className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-xs font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                              title="Convertir en investissement réel"
                            >
                              <ArrowRight className="h-2.5 w-2.5" />
                              {convertingOpportunityId === o.id ? '…' : 'Acheter'}
                            </button>
                          )}
                        </span>
                      </div>
                      {o.risk_factors && (
                        <div className="mt-1 truncate text-xs text-gray-500 italic" title={o.risk_factors}>
                          ⚠ {o.risk_factors}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <QuickOpportunityForm
              open={showOpportunityForm}
              onClose={() => setShowOpportunityForm(false)}
              onCreated={() => {
                setLiveOpportunitiesLoading(true);
                getInvestmentOpportunities().then(setLiveOpportunities).catch(() => {}).finally(() => setLiveOpportunitiesLoading(false));
              }}
            />
          </div>
        );
      }
      if (widget.id === 'document-status') {
        if (liveFreightDocumentsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement des documents…
            </div>
          );
        }
        const docs = liveFreightDocuments ?? [];
        const urgent = docs.filter((d) => d.priority === 'high').length;
        const pending = docs.filter((d) => d.status === 'En attente' || d.status === 'Brouillon').length;
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-teal-600" />
                <span>{docs.length} document{docs.length > 1 ? 's' : ''}</span>
              </div>
              {urgent > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{urgent} urgent{urgent > 1 ? 's' : ''}</span>
              )}
            </div>
            {docs.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <FileText className="h-8 w-8 text-gray-300 mb-2" />
                Aucun document fret
              </div>
            ) : (
              <ListWidget widget={widget} data={docs as any[]} widgetSize={widgetSize as any} onAction={handleWidgetAction} />
            )}
            {pending > 0 && (
              <div className="mt-1 px-1 text-xs text-amber-700">{pending} en attente / brouillon</div>
            )}
          </div>
        );
      }
      if (widget.id === 'inventory-alerts') {
        if (liveLogisticsStockAlertsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mr-2" />
              Chargement des alertes stock…
            </div>
          );
        }
        const alerts = liveLogisticsStockAlerts ?? [];
        const urgent = alerts.filter((a) => a.priority === 'high').length;
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-emerald-600" />
                <span>{alerts.length} alerte{alerts.length > 1 ? 's' : ''} ouverte{alerts.length > 1 ? 's' : ''}</span>
              </div>
              {urgent > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">{urgent} urgent{urgent > 1 ? 's' : ''}</span>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <Package className="h-8 w-8 text-gray-300 mb-2" />
                Aucune alerte stock ouverte
              </div>
            ) : (
              <ListWidget widget={widget} data={alerts as any[]} widgetSize={widgetSize as any} onAction={handleWidgetAction} />
            )}
          </div>
        );
      }
      if (widget.id === 'transaction-cases') {
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <TransactionCasesWidget widgetSize={widgetSize} dashboardRole={dashboardRole} />
          </div>
        );
      }
      return (
        <ListWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'pipeline':
      if (widget.id === 'stock-status') {
        return <StockStatusWidget />;
      }
      if (widget.id === 'sales-pipeline' || widget.id === 'leads-pipeline') {
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget />
          </div>
        );
      }
      if (widget.id === 'rental-pipeline') {
        return (
          <div className="flex-1 overflow-y-auto min-h-0 p-4" style={{ maxHeight: '100%' }}>
            <SalesPipelineWidget variant="rental" />
          </div>
        );
      }
      return (
        <ListWidget 
          widget={widget} 
          data={rawData as any[]} 
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'daily-actions':
      if (isLoueurContext) {
        if (loueurDailyActionsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des actions…
            </div>
          );
        }
        return (
          <DailyActionsPriorityWidget
            data={loueurDailyActions ?? []}
            widgetSize={widgetSize as any}
            onAction={handleWidgetAction}
          />
        );
      }
      // Hors loueur (ex. vendeur) : DailyActionsPriorityWidget charge LUI-MÊME ses
      // actions réelles (leads Kanban + messages + offres + stats, via
      // buildCorrelatedDailyActions). Le prop `data` n'est qu'un fallback legacy —
      // on passe [] volontairement (aucun mock, pas de Math.random).
      return (
        <DailyActionsPriorityWidget
          data={[]}
          widgetSize={widgetSize as any}
          onAction={handleWidgetAction}
        />
      );

    case 'metric':
      if (widget.id === 'rental-revenue') {
        if (liveRentalRevenueLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des revenus…
            </div>
          );
        }
        const metricPayload = liveRentalRevenue ?? (rawData as any);
        return (
          <MetricWidget
            widget={widget}
            data={metricPayload}
            widgetSize={widgetSize as any}
          />
        );
      }
      if (widget.id === 'customs-clearance') {
        return <CustomsClearanceWidget />;
      }
      if (widget.id === 'warehouse-occupancy') {
        return <WarehouseOccupancyWidget />;
      }
      if (widget.id === 'portfolio-value') {
        return <PortfolioValueWidget />;
      }
      if (widget.id === 'opportunities') {
        if (liveOpportunitiesScoreLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des opportunités…
            </div>
          );
        }
        const o = liveOpportunitiesScore;
        if (!o || o.activeCount === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Target className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune opportunité active</div>
              <button
                type="button"
                onClick={() => setShowOpportunityForm(true)}
                className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
              >
                <Plus className="h-3 w-3" />
                Première opportunité
              </button>
              <QuickOpportunityForm open={showOpportunityForm} onClose={() => setShowOpportunityForm(false)} onCreated={() => {
                setLiveOpportunitiesScoreLoading(true);
                getOpportunitiesScore().then(setLiveOpportunitiesScore).catch(() => {}).finally(() => setLiveOpportunitiesScoreLoading(false));
              }} />
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Target className="h-3.5 w-3.5 text-orange-600" />
                <span>Pipeline opportunités</span>
              </div>
              <button
                type="button"
                onClick={() => setShowOpportunityForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
              >
                <Plus className="h-3 w-3" />
                Nouvelle
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{o.activeCount}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  actives · {(o.totalValue / 1000000).toFixed(2)} M MAD · ROI moyen {o.avgRoi}%
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded bg-green-50 p-2">
                  <div className="text-xs font-bold text-green-700">{o.recommendBuy}</div>
                  <div className="text-xs text-green-700/80">À acheter</div>
                </div>
                <div className="rounded bg-orange-50 p-2">
                  <div className="text-xs font-bold text-orange-700">{o.recommendStudy}</div>
                  <div className="text-xs text-orange-700/80">À étudier</div>
                </div>
                <div className="rounded bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-700">{o.highRisk}</div>
                  <div className="text-xs text-red-700/80">Haut risque</div>
                </div>
              </div>
              {o.expiringIn7d > 0 && (
                <div className="mt-2 flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                  <Clock className="h-3 w-3" />
                  {o.expiringIn7d} expire{o.expiringIn7d > 1 ? 'nt' : ''} dans 7 jours
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500">
                Taux conversion historique : <span className="font-semibold text-gray-700">{o.conversionRate}%</span>
                {' '}({o.converted} achetées · {o.refused} refusées)
              </div>
            </div>
            <QuickOpportunityForm open={showOpportunityForm} onClose={() => setShowOpportunityForm(false)} onCreated={() => {
              setLiveOpportunitiesScoreLoading(true);
              getOpportunitiesScore().then(setLiveOpportunitiesScore).catch(() => {}).finally(() => setLiveOpportunitiesScoreLoading(false));
            }} />
          </div>
        );
      }
      if (widget.id === 'commission-tracking') {
        return <CommissionTrackingWidget />;
      }
      if (widget.id === 'active-deliveries') {
        if (liveActiveDeliveriesLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des livraisons…
            </div>
          );
        }
        const stats = liveActiveDeliveries ?? { total: 0, inProgress: 0, planned: 0, delayed: 0, urgent: 0, rows: [] };
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Truck className="h-3.5 w-3.5 text-orange-600" />
                <span>Livraisons actives</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
                title="Planifier une nouvelle livraison"
              >
                <Plus className="h-3 w-3" />
                Nouvelle livraison
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900">{stats.total}</div>
                <div className="mt-1 text-xs text-gray-500">en cours / planifiées</div>
              </div>
              <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded bg-orange-50 p-2">
                  <div className="text-xs font-bold text-orange-700">{stats.inProgress}</div>
                  <div className="text-xs text-orange-700/80">En route</div>
                </div>
                <div className="rounded bg-blue-50 p-2">
                  <div className="text-xs font-bold text-blue-700">{stats.planned}</div>
                  <div className="text-xs text-blue-700/80">Planifiées</div>
                </div>
                <div className="rounded bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-700">{stats.delayed}</div>
                  <div className="text-xs text-red-700/80">Retardées</div>
                </div>
              </div>
              {stats.urgent > 0 && (
                <div className="mt-2 flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  {stats.urgent} mission{stats.urgent > 1 ? 's' : ''} prioritaire{stats.urgent > 1 ? 's' : ''}
                </div>
              )}
            </div>
            <QuickDeliveryForm
              open={showDeliveryForm}
              onClose={() => setShowDeliveryForm(false)}
              onCreated={() => {
                setLiveActiveDeliveriesLoading(true);
                getActiveDeliveries()
                  .then(setLiveActiveDeliveries)
                  .catch(() => {})
                  .finally(() => setLiveActiveDeliveriesLoading(false));
              }}
            />
          </div>
        );
      }
      return (
        <MetricWidget
          widget={widget}
          data={rawData as any}
          widgetSize={widgetSize as any}
        />
      );

    case 'inventory':
      return <InventoryStatusWidget />;

    case 'equipment':
      if (widget.id === 'equipment-availability') {
        if (liveEquipmentAvailLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement du parc…
            </div>
          );
        }
        const equipData =
          liveEquipmentAvail ?? (Array.isArray(rawData) ? (rawData as any[]) : []);
        return (
          <EquipmentAvailabilityWidget
            data={equipData}
            widgetSize={widgetSize}
          />
        );
      }
      return (
        <EquipmentAvailabilityWidget
          data={Array.isArray(rawData) ? rawData as any[] : []}
          widgetSize={widgetSize}
        />
      );

    case 'calendar':
      if (widget.id === 'upcoming-rentals') {
        if (liveUpcomingRentalsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des locations…
            </div>
          );
        }
        return (
          <UpcomingRentalsWidget
            data={liveUpcomingRentals ?? undefined}
            widgetSize={widgetSize}
            onAction={handleWidgetAction}
          />
        );
      }
      if (widget.id === 'driver-schedule') {
        if (liveDriverScheduleLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement du planning…
            </div>
          );
        }
        const schedule = liveDriverSchedule ?? [];
        if (schedule.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <div>Aucun chauffeur enregistré</div>
              <div className="text-xs text-gray-400 mt-1">
                Ajoutez des chauffeurs dans Paramètres &gt; Équipe
              </div>
            </div>
          );
        }
        const totalMissions = schedule.reduce((s, d: any) => s + (d.missions?.length || 0), 0);
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
              <span>
                <span className="font-medium text-gray-900">{schedule.length}</span> chauffeurs ·{' '}
                <span className="font-medium text-gray-900">{totalMissions}</span> missions / 7j
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="h-3 w-3" /> 7 jours à venir
              </span>
            </div>
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
              {schedule.map((driver: any) => {
                const statusColor =
                  driver.status === 'Disponible'
                    ? 'bg-green-100 text-green-700'
                    : driver.status === 'En mission'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-600';
                const licenseExpiry = driver.licenseExpiry ? new Date(driver.licenseExpiry) : null;
                const licenseExpiringSoon = licenseExpiry
                  ? (licenseExpiry.getTime() - Date.now()) / (1000 * 3600 * 24) < 60
                  : false;
                return (
                  <div key={driver.id} className="rounded border border-gray-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                          <span className="truncate">{driver.name}</span>
                          {licenseExpiringSoon && (
                            <span title="Permis arrive à expiration" className="text-xs text-amber-600">⚠</span>
                          )}
                        </div>
                        {driver.phone && (
                          <div className="text-xs text-gray-500">{driver.phone}</div>
                        )}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusColor}`}>
                        {driver.status}
                      </span>
                    </div>
                    {driver.missions.length > 0 ? (
                      <div className="mt-1.5 space-y-1">
                        {driver.missions.slice(0, 3).map((m: any) => {
                          const date = m.pickupDate ? new Date(m.pickupDate) : null;
                          const dateLabel = date
                            ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : '';
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1 text-xs">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-gray-700">{m.label}</div>
                                {m.destination && (
                                  <div className="truncate text-xs text-gray-500">→ {m.destination}</div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-gray-600">{dateLabel}</div>
                                {(m.priority === 'Urgente' || m.priority === 'Haute') && (
                                  <div className="text-xs font-semibold text-red-600">{m.priority}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {driver.missions.length > 3 && (
                          <div className="text-center text-xs text-gray-400">
                            +{driver.missions.length - 3} mission{driver.missions.length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-xs text-gray-400 italic">Aucune mission planifiée</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <UpcomingRentalsWidget
          data={Array.isArray(rawData) ? rawData as any : undefined}
          widgetSize={widgetSize}
          onAction={handleWidgetAction}
        />
      );

    case 'map':
      if (widget.id === 'delivery-map') {
        return <DeliveryMapWidget />;
      }
      if (widget.id === 'container-tracking') {
        return <ContainerTrackingWidget />;
      }
      if (widget.id === 'route-optimization') {
        if (liveRouteTrackingLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mr-2" />
              Chargement des routes…
            </div>
          );
        }
        const routes = liveRouteTracking ?? [];
        const mappable = routes.filter(
          (r) =>
            r.origin_lat != null &&
            r.origin_lng != null &&
            r.dest_lat != null &&
            r.dest_lng != null,
        );
        if (mappable.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Truck className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune route géolocalisée</div>
              <div className="text-xs text-gray-400 mt-1">Renseignez origine / destination GPS</div>
            </div>
          );
        }
        const active = routes.filter((r) => r.status === 'En route' || r.status === 'Retard').length;
        return (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3 text-emerald-600" />
                {routes.length} route{routes.length > 1 ? 's' : ''}
              </span>
              {active > 0 && (
                <span className="rounded bg-orange-50 px-1.5 py-0.5 font-medium text-orange-800">{active} actives / retard</span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden rounded border border-gray-100">
              <LogisticsRoutesMap routes={mappable} />
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg border border-dashed border-gray-300 p-4">
          <div className="text-center">
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm font-medium text-gray-600">{widget.title}</p>
            <p className="text-xs text-gray-400 mt-1">
              Type « map » non pris en charge pour l’identifiant <span className="font-mono text-gray-500">{widget.id}</span>. Ajoutez un rendu dédié dans le tableau de bord.
            </p>
          </div>
        </div>
      );

    default:
      return (
        <div className="text-center text-gray-500 py-4">
          <div className="text-sm">Type de widget non supporté: {widget.type}</div>
          <div className="text-xs">ID: {widget.id}</div>
        </div>
      );
  }
};

// Mémoïsation : WidgetRenderer est instancié par cellule de grille et ses données
// sont INTERNES (fetchs propres), pas issues des props. On ne re-rend donc que si la
// CONFIG change (widget id/type, taille, rôle) — les re-rendus de polling du parent
// ne repropagent plus tout l'arbre. Sûr : jamais périmé (les données restent gérées
// par l'état interne du composant).
function widgetPropsEqual(prev: WidgetRendererProps, next: WidgetRendererProps): boolean {
  return (
    prev.widget?.id === next.widget?.id &&
    prev.widget?.type === next.widget?.type &&
    prev.widgetSize === next.widgetSize &&
    prev.dashboardRole === next.dashboardRole
  );
}

export default React.memo(WidgetRenderer, widgetPropsEqual); 