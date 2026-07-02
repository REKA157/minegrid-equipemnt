import React, { useState, useEffect } from 'react';
import { Widget } from '../../constants/dashboardTypes';
import { getWidgetData } from '../../constants/mockData';
import { supabaseClient } from '../../utils/supabaseClient';
import {
  getRentalRevenue,
  getUpcomingRentals,
  getRentalOverdue,
} from '../../utils/enterpriseApi/rentals';
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
  getCreditApplications,
  getInsurancePolicies,
  getCommissionTracking,
  getClientPortfolio,
  getPerformanceAnalytics,
  getBankComparison,
  renewInsurancePolicy,
  type CreditApplicationRow,
  type InsurancePolicyRow,
} from '../../utils/enterpriseApi/courtier';
import QuickCreditApplicationForm from './widgets/QuickCreditApplicationForm';
import QuickInsurancePolicyForm from './widgets/QuickInsurancePolicyForm';
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

// Déterminer la taille du texte en fonction de la taille du widget et du type d'élément
function getFontSizeFromWidgetSize(size: string, type: 'title' | 'value' = 'title') {
  if (type === 'value') {
    if (size === '1/3') return 'text-[clamp(1rem,2vw,1.2rem)]';
    if (size === '1/2') return 'text-[clamp(1.1rem,2.5vw,1.5rem)]';
    if (size === '2/3') return 'text-[clamp(1.3rem,3vw,2rem)]';
    if (size === '1/1') return 'text-[clamp(1.5rem,4vw,2.5rem)]';
  } else {
    if (size === '1/3') return 'text-sm md:text-base';
    if (size === '1/2') return 'text-base md:text-lg';
    if (size === '2/3') return 'text-lg md:text-xl';
    if (size === '1/1') return 'text-xl md:text-2xl';
  }
  return 'text-base';
}

// Classe CSS pour l'ellipsis (à ajouter dans le global CSS si besoin)
// .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

function mapLoueurStatusForCalendar(
  status: string,
): 'confirmed' | 'pending' | 'in_progress' {
  const s = (status || '').toLowerCase();
  if (s.includes('cours')) return 'in_progress';
  if (s.includes('confirm') || s.includes('prête') || s.includes('prete')) return 'confirmed';
  return 'pending';
}

function mapUpcomingRentalsForWidget(rows: Awaited<ReturnType<typeof getUpcomingRentals>>) {
  return rows.map((r) => ({
    id: String(r.id),
    equipment: r.equipmentFullName,
    client: r.clientName,
    clientPhone: undefined as string | undefined,
    location: '—',
    startDate: r.start_date ? String(r.start_date).split('T')[0] : '',
    endDate: r.end_date ? String(r.end_date).split('T')[0] : '',
    dailyRate: Number(r.pricePerDay) || 0,
    status: mapLoueurStatusForCalendar(String(r.status || '')),
    notes: undefined as string | undefined,
  }));
}

// ============================================================================
// MAPPERS MECANICIEN
// ============================================================================

type RepairsRow = Awaited<ReturnType<typeof getRepairsStatus>>[number];
type InventoryRow = Awaited<ReturnType<typeof getInventoryStatus>>[number];
type WorkloadRow = Awaited<ReturnType<typeof getTechniciansWorkload>>[number];

function mapRepairsForList(rows: RepairsRow[]) {
  return rows.map((r, idx) => {
    const statusLower = String(r.status || '').toLowerCase();
    const priority: 'high' | 'medium' | 'low' =
      statusLower.includes('urgent') || statusLower.includes('cours')
        ? 'high'
        : statusLower.includes('attente')
          ? 'medium'
          : 'low';
    return {
      id: r.id ?? `repair-${idx}`,
      title: `${r.equipment || 'Équipement'} — ${r.problem || 'Réparation'}`,
      description: `Tech: ${r.technician || 'Non assigné'} · ${r.estimated || ''} · ${
        typeof r.cost === 'number' ? `${r.cost.toLocaleString('fr-FR')} MAD` : ''
      }`.trim(),
      status: r.status || 'En attente',
      priority,
      timestamp: new Date().toISOString(),
    };
  });
}

function mapInventoryForChart(rows: InventoryRow[]) {
  return rows.slice(0, 8).map((r) => ({
    name: r.category || r.title || 'Article',
    value: Number(r.stock) || 0,
    min: Number(r.minStock) || 0,
  }));
}

function mapWorkloadForChart(rows: WorkloadRow[]) {
  return rows.map((r) => ({
    name: r.name || 'Technicien',
    value: Math.round(Number(r.workload_percentage) || 0),
  }));
}

function mapEquipmentAvailabilityForWidget(details: any[]) {
  return details.map((m) => ({
    id: String(m.id),
    name: (m.equipmentFullName || m.name || 'Équipement') as string,
    status: (m.status === 'Disponible'
      ? 'available'
      : m.status === 'En location'
        ? 'rented'
        : 'maintenance') as 'available' | 'rented' | 'maintenance',
    location: 'Parc',
    lastUpdate: (m.updated_at as string) || new Date().toISOString(),
    returnDate: m.currentRental?.endDate
      ? String(m.currentRental.endDate).split('T')[0]
      : undefined,
    nextMaintenance: m.currentIntervention?.scheduledDate
      ? String(m.currentIntervention.scheduledDate).split('T')[0]
      : undefined,
  }));
}

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
  const [liveInterventionsToday, setLiveInterventionsToday] = useState<
    Awaited<ReturnType<typeof getDailyInterventions>> | null
  >(null);
  const [liveInterventionsTodayLoading, setLiveInterventionsTodayLoading] = useState(false);

  const [liveRepairs, setLiveRepairs] = useState<ReturnType<typeof mapRepairsForList> | null>(null);
  const [liveRepairsLoading, setLiveRepairsLoading] = useState(false);

  const [liveInventory, setLiveInventory] = useState<ReturnType<typeof mapInventoryForChart> | null>(null);
  const [liveInventoryLoading, setLiveInventoryLoading] = useState(false);

  const [liveWorkload, setLiveWorkload] = useState<ReturnType<typeof mapWorkloadForChart> | null>(null);
  const [liveWorkloadLoading, setLiveWorkloadLoading] = useState(false);

  // --- MECANICIEN : modales actions rapides ---
  const [showInterventionForm, setShowInterventionForm] = useState(false);
  const [orderingPartId, setOrderingPartId] = useState<string | null>(null);

  // --- TRANSPORTEUR : 4 widgets data live ---
  const [liveActiveDeliveries, setLiveActiveDeliveries] = useState<
    Awaited<ReturnType<typeof getActiveDeliveries>> | null
  >(null);
  const [liveActiveDeliveriesLoading, setLiveActiveDeliveriesLoading] = useState(false);

  const [liveDeliveryMap, setLiveDeliveryMap] = useState<
    Awaited<ReturnType<typeof getDeliveryMapData>> | null
  >(null);
  const [liveDeliveryMapLoading, setLiveDeliveryMapLoading] = useState(false);

  const [liveTransportCosts, setLiveTransportCosts] = useState<
    Awaited<ReturnType<typeof getTransportCosts>> | null
  >(null);
  const [liveTransportCostsLoading, setLiveTransportCostsLoading] = useState(false);

  const [liveDriverSchedule, setLiveDriverSchedule] = useState<
    Awaited<ReturnType<typeof getDriverSchedule>> | null
  >(null);
  const [liveDriverScheduleLoading, setLiveDriverScheduleLoading] = useState(false);

  const [showDeliveryForm, setShowDeliveryForm] = useState(false);

  // --- COURTIER : 5 widgets data live ---
  const [liveCreditApps, setLiveCreditApps] = useState<CreditApplicationRow[] | null>(null);
  const [liveCreditAppsLoading, setLiveCreditAppsLoading] = useState(false);
  const [livePolicies, setLivePolicies] = useState<InsurancePolicyRow[] | null>(null);
  const [livePoliciesLoading, setLivePoliciesLoading] = useState(false);
  const [liveCommissions, setLiveCommissions] = useState<
    Awaited<ReturnType<typeof getCommissionTracking>> | null
  >(null);
  const [liveCommissionsLoading, setLiveCommissionsLoading] = useState(false);
  const [liveClientPortfolio, setLiveClientPortfolio] = useState<
    Awaited<ReturnType<typeof getClientPortfolio>> | null
  >(null);
  const [liveClientPortfolioLoading, setLiveClientPortfolioLoading] = useState(false);
  const [livePerformance, setLivePerformance] = useState<
    Awaited<ReturnType<typeof getPerformanceAnalytics>> | null
  >(null);
  const [livePerformanceLoading, setLivePerformanceLoading] = useState(false);

  const [showCreditForm, setShowCreditForm] = useState(false);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [renewingPolicyId, setRenewingPolicyId] = useState<string | null>(null);

  // --- INVESTISSEUR : 5 widgets data live ---
  const [livePortfolioValue, setLivePortfolioValue] = useState<
    Awaited<ReturnType<typeof getPortfolioValue>> | null
  >(null);
  const [livePortfolioValueLoading, setLivePortfolioValueLoading] = useState(false);
  const [liveOpportunities, setLiveOpportunities] = useState<OpportunityRow[] | null>(null);
  const [liveOpportunitiesLoading, setLiveOpportunitiesLoading] = useState(false);
  const [liveRoiAnalysis, setLiveRoiAnalysis] = useState<
    Awaited<ReturnType<typeof getRoiAnalysis>> | null
  >(null);
  const [liveRoiAnalysisLoading, setLiveRoiAnalysisLoading] = useState(false);
  const [liveRiskAssessment, setLiveRiskAssessment] = useState<
    Awaited<ReturnType<typeof getRiskAssessment>> | null
  >(null);
  const [liveRiskAssessmentLoading, setLiveRiskAssessmentLoading] = useState(false);
  const [liveOpportunitiesScore, setLiveOpportunitiesScore] = useState<
    Awaited<ReturnType<typeof getOpportunitiesScore>> | null
  >(null);
  const [liveOpportunitiesScoreLoading, setLiveOpportunitiesScoreLoading] = useState(false);

  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [convertingOpportunityId, setConvertingOpportunityId] = useState<string | null>(null);

  // --- TRANSITAIRE (douane / conteneurs / I-E / documents) ---
  const [liveCustomsMetrics, setLiveCustomsMetrics] = useState<
    Awaited<ReturnType<typeof getCustomsClearanceMetrics>> | null
  >(null);
  const [liveCustomsMetricsLoading, setLiveCustomsMetricsLoading] = useState(false);
  const [liveFreightContainers, setLiveFreightContainers] = useState<
    Awaited<ReturnType<typeof getContainerTrackingRows>> | null
  >(null);
  const [liveFreightContainersLoading, setLiveFreightContainersLoading] = useState(false);
  const [liveImportExportStats, setLiveImportExportStats] = useState<
    Awaited<ReturnType<typeof getImportExportStats>> | null
  >(null);
  const [liveImportExportStatsLoading, setLiveImportExportStatsLoading] = useState(false);
  const [liveFreightDocuments, setLiveFreightDocuments] = useState<
    Awaited<ReturnType<typeof getFreightDocumentsForList>> | null
  >(null);
  const [liveFreightDocumentsLoading, setLiveFreightDocumentsLoading] = useState(false);
  const [liveDemurrage, setLiveDemurrage] = useState<
    Awaited<ReturnType<typeof getDemurrageExposure>> | null
  >(null);
  const [liveDemurrageLoading, setLiveDemurrageLoading] = useState(false);
  const [liveRentalOverdue, setLiveRentalOverdue] = useState<
    Awaited<ReturnType<typeof getRentalOverdue>> | null
  >(null);
  const [liveRentalOverdueLoading, setLiveRentalOverdueLoading] = useState(false);
  const [liveBankComparison, setLiveBankComparison] = useState<Awaited<ReturnType<typeof getBankComparison>> | null>(null);
  const [liveBankComparisonLoading, setLiveBankComparisonLoading] = useState(false);
  const [liveLogisticsProfit, setLiveLogisticsProfit] = useState<Awaited<ReturnType<typeof getLogisticsProfitability>> | null>(null);
  const [liveLogisticsProfitLoading, setLiveLogisticsProfitLoading] = useState(false);
  const [liveDeadhead, setLiveDeadhead] = useState<Awaited<ReturnType<typeof getDeadheadCost>> | null>(null);
  const [liveDeadheadLoading, setLiveDeadheadLoading] = useState(false);
  const [liveYieldGap, setLiveYieldGap] = useState<Awaited<ReturnType<typeof getYieldRealizedVsExpected>> | null>(null);
  const [liveYieldGapLoading, setLiveYieldGapLoading] = useState(false);

  // --- LOGISTICIEN / SUPPLY CHAIN ---
  const [liveWarehouseOccupancy, setLiveWarehouseOccupancy] = useState<
    Awaited<ReturnType<typeof getWarehouseOccupancyMetrics>> | null
  >(null);
  const [liveWarehouseOccupancyLoading, setLiveWarehouseOccupancyLoading] = useState(false);
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
      if (widget.id === 'interventions-today') {
        getDailyInterventions()
          .then((rows) => setLiveInterventionsToday(rows))
          .catch(() => {});
      }
      if (widget.id === 'repair-status') {
        getRepairsStatus()
          .then((rows) => setLiveRepairs(mapRepairsForList(rows)))
          .catch(() => {});
      }
      if (widget.id === 'parts-inventory') {
        getInventoryStatus()
          .then((rows) => setLiveInventory(mapInventoryForChart(rows)))
          .catch(() => {});
      }
      if (widget.id === 'technician-workload') {
        getTechniciansWorkload()
          .then((rows) => setLiveWorkload(mapWorkloadForChart(rows)))
          .catch(() => {});
      }
      if (widget.id === 'active-deliveries') {
        getActiveDeliveries().then(setLiveActiveDeliveries).catch(() => {});
      }
      if (widget.id === 'delivery-map') {
        getDeliveryMapData().then(setLiveDeliveryMap).catch(() => {});
      }
      if (widget.id === 'transport-costs') {
        getTransportCosts().then(setLiveTransportCosts).catch(() => {});
      }
      if (widget.id === 'driver-schedule') {
        getDriverSchedule().then(setLiveDriverSchedule).catch(() => {});
      }
      if (widget.id === 'credit-applications') {
        getCreditApplications().then(setLiveCreditApps).catch(() => {});
      }
      if (widget.id === 'insurance-policies') {
        getInsurancePolicies().then(setLivePolicies).catch(() => {});
      }
      if (widget.id === 'commission-tracking') {
        getCommissionTracking().then(setLiveCommissions).catch(() => {});
      }
      if (widget.id === 'client-portfolio') {
        getClientPortfolio().then(setLiveClientPortfolio).catch(() => {});
      }
      if (widget.id === 'performance-analytics') {
        getPerformanceAnalytics().then(setLivePerformance).catch(() => {});
      }
      if (widget.id === 'portfolio-value') {
        getPortfolioValue().then(setLivePortfolioValue).catch(() => {});
      }
      if (widget.id === 'investment-opportunities') {
        getInvestmentOpportunities().then(setLiveOpportunities).catch(() => {});
      }
      if (widget.id === 'roi-analysis') {
        getRoiAnalysis().then(setLiveRoiAnalysis).catch(() => {});
      }
      if (widget.id === 'risk-assessment') {
        getRiskAssessment().then(setLiveRiskAssessment).catch(() => {});
      }
      if (widget.id === 'opportunities') {
        getOpportunitiesScore().then(setLiveOpportunitiesScore).catch(() => {});
      }
      if (widget.id === 'customs-clearance') {
        getCustomsClearanceMetrics().then(setLiveCustomsMetrics).catch(() => {});
      }
      if (widget.id === 'container-tracking') {
        getContainerTrackingRows().then(setLiveFreightContainers).catch(() => {});
      }
      if (widget.id === 'import-export-stats') {
        getImportExportStats().then(setLiveImportExportStats).catch(() => {});
      }
      if (widget.id === 'document-status') {
        getFreightDocumentsForList().then(setLiveFreightDocuments).catch(() => {});
      }
      if (widget.id === 'warehouse-occupancy') {
        getWarehouseOccupancyMetrics().then(setLiveWarehouseOccupancy).catch(() => {});
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

  // --- MECANICIEN : interventions-today ---
  useEffect(() => {
    if (widget.id !== 'interventions-today') return;
    let cancelled = false;
    (async () => {
      setLiveInterventionsTodayLoading(true);
      try {
        const rows = await getDailyInterventions();
        if (!cancelled) setLiveInterventionsToday(rows);
      } catch (e) {
        console.error('WidgetRenderer getDailyInterventions', e);
        if (!cancelled) setLiveInterventionsToday([]);
      } finally {
        if (!cancelled) setLiveInterventionsTodayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

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

  // --- MECANICIEN : parts-inventory ---
  useEffect(() => {
    if (widget.id !== 'parts-inventory') return;
    let cancelled = false;
    (async () => {
      setLiveInventoryLoading(true);
      try {
        const rows = await getInventoryStatus();
        if (!cancelled) setLiveInventory(mapInventoryForChart(rows));
      } catch (e) {
        console.error('WidgetRenderer getInventoryStatus', e);
        if (!cancelled) setLiveInventory([]);
      } finally {
        if (!cancelled) setLiveInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [widget.id]);

  // --- MECANICIEN : technician-workload ---
  useEffect(() => {
    if (widget.id !== 'technician-workload') return;
    let cancelled = false;
    (async () => {
      setLiveWorkloadLoading(true);
      try {
        const rows = await getTechniciansWorkload();
        if (!cancelled) setLiveWorkload(mapWorkloadForChart(rows));
      } catch (e) {
        console.error('WidgetRenderer getTechniciansWorkload', e);
        if (!cancelled) setLiveWorkload([]);
      } finally {
        if (!cancelled) setLiveWorkloadLoading(false);
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

  // --- TRANSPORTEUR : delivery-map ---
  useEffect(() => {
    if (widget.id !== 'delivery-map') return;
    let cancelled = false;
    (async () => {
      setLiveDeliveryMapLoading(true);
      try {
        const data = await getDeliveryMapData();
        if (!cancelled) setLiveDeliveryMap(data);
      } catch (e) {
        console.error('WidgetRenderer getDeliveryMapData', e);
        if (!cancelled) setLiveDeliveryMap({ deliveries: [], vehicles: [] });
      } finally {
        if (!cancelled) setLiveDeliveryMapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- TRANSPORTEUR : transport-costs ---
  useEffect(() => {
    if (widget.id !== 'transport-costs') return;
    let cancelled = false;
    (async () => {
      setLiveTransportCostsLoading(true);
      try {
        const data = await getTransportCosts();
        if (!cancelled) setLiveTransportCosts(data);
      } catch (e) {
        console.error('WidgetRenderer getTransportCosts', e);
        if (!cancelled) setLiveTransportCosts([]);
      } finally {
        if (!cancelled) setLiveTransportCostsLoading(false);
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

  // --- COURTIER : credit-applications ---
  useEffect(() => {
    if (widget.id !== 'credit-applications') return;
    let cancelled = false;
    (async () => {
      setLiveCreditAppsLoading(true);
      try {
        const data = await getCreditApplications();
        if (!cancelled) setLiveCreditApps(data);
      } catch (e) {
        console.error('WidgetRenderer getCreditApplications', e);
        if (!cancelled) setLiveCreditApps([]);
      } finally {
        if (!cancelled) setLiveCreditAppsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- COURTIER : insurance-policies ---
  useEffect(() => {
    if (widget.id !== 'insurance-policies') return;
    let cancelled = false;
    (async () => {
      setLivePoliciesLoading(true);
      try {
        const data = await getInsurancePolicies();
        if (!cancelled) setLivePolicies(data);
      } catch (e) {
        console.error('WidgetRenderer getInsurancePolicies', e);
        if (!cancelled) setLivePolicies([]);
      } finally {
        if (!cancelled) setLivePoliciesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- COURTIER : commission-tracking ---
  useEffect(() => {
    if (widget.id !== 'commission-tracking') return;
    let cancelled = false;
    (async () => {
      setLiveCommissionsLoading(true);
      try {
        const data = await getCommissionTracking();
        if (!cancelled) setLiveCommissions(data);
      } catch (e) {
        console.error('WidgetRenderer getCommissionTracking', e);
        if (!cancelled) setLiveCommissions({ totalCommission: 0, creditCommission: 0, policyCommission: 0, monthCommission: 0, creditMonth: 0, policyMonth: 0, commissionDue: 0, commissionEarned: 0, creditCount: 0, policyCount: 0 });
      } finally {
        if (!cancelled) setLiveCommissionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- COURTIER : client-portfolio ---
  useEffect(() => {
    if (widget.id !== 'client-portfolio') return;
    let cancelled = false;
    (async () => {
      setLiveClientPortfolioLoading(true);
      try {
        const data = await getClientPortfolio();
        if (!cancelled) setLiveClientPortfolio(data);
      } catch (e) {
        console.error('WidgetRenderer getClientPortfolio', e);
        if (!cancelled) setLiveClientPortfolio([]);
      } finally {
        if (!cancelled) setLiveClientPortfolioLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- COURTIER : performance-analytics ---
  useEffect(() => {
    if (widget.id !== 'performance-analytics') return;
    let cancelled = false;
    (async () => {
      setLivePerformanceLoading(true);
      try {
        const data = await getPerformanceAnalytics();
        if (!cancelled) setLivePerformance(data);
      } catch (e) {
        console.error('WidgetRenderer getPerformanceAnalytics', e);
        if (!cancelled) setLivePerformance([]);
      } finally {
        if (!cancelled) setLivePerformanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- INVESTISSEUR : portfolio-value ---
  useEffect(() => {
    if (widget.id !== 'portfolio-value') return;
    let cancelled = false;
    (async () => {
      setLivePortfolioValueLoading(true);
      try {
        const data = await getPortfolioValue();
        if (!cancelled) setLivePortfolioValue(data);
      } catch (e) {
        console.error('WidgetRenderer getPortfolioValue', e);
      } finally {
        if (!cancelled) setLivePortfolioValueLoading(false);
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

  // --- INVESTISSEUR : roi-analysis ---
  useEffect(() => {
    if (widget.id !== 'roi-analysis') return;
    let cancelled = false;
    (async () => {
      setLiveRoiAnalysisLoading(true);
      try {
        const data = await getRoiAnalysis();
        if (!cancelled) setLiveRoiAnalysis(data);
      } catch (e) {
        console.error('WidgetRenderer getRoiAnalysis', e);
      } finally {
        if (!cancelled) setLiveRoiAnalysisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- INVESTISSEUR : risk-assessment ---
  useEffect(() => {
    if (widget.id !== 'risk-assessment') return;
    let cancelled = false;
    (async () => {
      setLiveRiskAssessmentLoading(true);
      try {
        const data = await getRiskAssessment();
        if (!cancelled) setLiveRiskAssessment(data);
      } catch (e) {
        console.error('WidgetRenderer getRiskAssessment', e);
      } finally {
        if (!cancelled) setLiveRiskAssessmentLoading(false);
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

  // --- TRANSITAIRE ---
  useEffect(() => {
    if (widget.id !== 'customs-clearance') return;
    let cancelled = false;
    (async () => {
      setLiveCustomsMetricsLoading(true);
      try {
        const data = await getCustomsClearanceMetrics();
        if (!cancelled) setLiveCustomsMetrics(data);
      } catch (e) {
        console.error('WidgetRenderer getCustomsClearanceMetrics', e);
      } finally {
        if (!cancelled) setLiveCustomsMetricsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'container-tracking') return;
    let cancelled = false;
    (async () => {
      setLiveFreightContainersLoading(true);
      try {
        const data = await getContainerTrackingRows();
        if (!cancelled) setLiveFreightContainers(data);
      } catch (e) {
        console.error('WidgetRenderer getContainerTrackingRows', e);
        if (!cancelled) setLiveFreightContainers([]);
      } finally {
        if (!cancelled) setLiveFreightContainersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'import-export-stats') return;
    let cancelled = false;
    (async () => {
      setLiveImportExportStatsLoading(true);
      try {
        const data = await getImportExportStats();
        if (!cancelled) setLiveImportExportStats(data);
      } catch (e) {
        console.error('WidgetRenderer getImportExportStats', e);
      } finally {
        if (!cancelled) setLiveImportExportStatsLoading(false);
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
    if (widget.id !== 'demurrage-tracking') return;
    let cancelled = false;
    (async () => {
      setLiveDemurrageLoading(true);
      try {
        const data = await getDemurrageExposure();
        if (!cancelled) setLiveDemurrage(data);
      } catch (e) {
        console.error('WidgetRenderer getDemurrageExposure', e);
      } finally {
        if (!cancelled) setLiveDemurrageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'rental-overdue') return;
    let cancelled = false;
    (async () => {
      setLiveRentalOverdueLoading(true);
      try {
        const data = await getRentalOverdue();
        if (!cancelled) setLiveRentalOverdue(data);
      } catch (e) {
        console.error('WidgetRenderer getRentalOverdue', e);
      } finally {
        if (!cancelled) setLiveRentalOverdueLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'bank-comparator') return;
    let cancelled = false;
    (async () => {
      setLiveBankComparisonLoading(true);
      try {
        const data = await getBankComparison();
        if (!cancelled) setLiveBankComparison(data);
      } catch (e) {
        console.error('WidgetRenderer getBankComparison', e);
      } finally {
        if (!cancelled) setLiveBankComparisonLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'logistics-profitability') return;
    let cancelled = false;
    (async () => {
      setLiveLogisticsProfitLoading(true);
      try {
        const data = await getLogisticsProfitability();
        if (!cancelled) setLiveLogisticsProfit(data);
      } catch (e) {
        console.error('WidgetRenderer getLogisticsProfitability', e);
      } finally {
        if (!cancelled) setLiveLogisticsProfitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'deadhead-cost') return;
    let cancelled = false;
    (async () => {
      setLiveDeadheadLoading(true);
      try {
        const data = await getDeadheadCost();
        if (!cancelled) setLiveDeadhead(data);
      } catch (e) {
        console.error('WidgetRenderer getDeadheadCost', e);
      } finally {
        if (!cancelled) setLiveDeadheadLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  useEffect(() => {
    if (widget.id !== 'yield-realized-vs-expected') return;
    let cancelled = false;
    (async () => {
      setLiveYieldGapLoading(true);
      try {
        const data = await getYieldRealizedVsExpected();
        if (!cancelled) setLiveYieldGap(data);
      } catch (e) {
        console.error('WidgetRenderer getYieldRealizedVsExpected', e);
      } finally {
        if (!cancelled) setLiveYieldGapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [widget.id]);

  // --- LOGISTICIEN ---
  useEffect(() => {
    if (widget.id !== 'warehouse-occupancy') return;
    let cancelled = false;
    (async () => {
      setLiveWarehouseOccupancyLoading(true);
      try {
        const data = await getWarehouseOccupancyMetrics();
        if (!cancelled) setLiveWarehouseOccupancy(data);
      } catch (e) {
        console.error('WidgetRenderer getWarehouseOccupancyMetrics', e);
      } finally {
        if (!cancelled) setLiveWarehouseOccupancyLoading(false);
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

  const handleWidgetAction = (action: string, actionData: any) => {
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
        return <SalesEvolutionWidgetEnriched />;
      }
      if (widget.id === 'interventions-today') {
        const interventionsData = liveInterventionsToday ?? [];
        const totalToday = interventionsData.length;
        const urgentCount = interventionsData.filter(
          (i: any) => (i?.priority || '').toLowerCase().includes('haut') || (i?.priority || '').toLowerCase().includes('urg'),
        ).length;
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-medium text-gray-900">{totalToday}</span>
                <span>OT planifiés</span>
                {urgentCount > 0 && (
                  <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    {urgentCount} urgent{urgentCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowInterventionForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
                title="Créer un nouvel ordre de travail"
              >
                <Plus className="h-3 w-3" />
                Nouvel OT
              </button>
            </div>
            {liveInterventionsTodayLoading ? (
              <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
                Chargement des interventions…
              </div>
            ) : interventionsData.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <div>Aucune intervention prévue aujourd'hui</div>
                <button
                  type="button"
                  onClick={() => setShowInterventionForm(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                >
                  <Plus className="h-3 w-3" />
                  Créer le premier OT
                </button>
              </div>
            ) : (
              <ChartWidget
                widget={widget}
                data={interventionsData as any[]}
                widgetSize={widgetSize as any}
              />
            )}
            <QuickInterventionForm
              open={showInterventionForm}
              onClose={() => setShowInterventionForm(false)}
              onCreated={() => {
                setLiveInterventionsTodayLoading(true);
                getDailyInterventions()
                  .then((rows) => setLiveInterventionsToday(rows))
                  .catch(() => setLiveInterventionsToday([]))
                  .finally(() => setLiveInterventionsTodayLoading(false));
              }}
            />
          </div>
        );
      }
      if (widget.id === 'parts-inventory') {
        const inventoryData = liveInventory ?? [];
        const lowStockItems = inventoryData.filter(
          (i: any) => typeof i?.stock === 'number' && typeof i?.minStock === 'number' && i.stock < i.minStock,
        );
        const handleQuickReorder = async (item: any) => {
          if (!item?.id || orderingPartId) return;
          const missing = Math.max((item.minStock ?? 0) - (item.stock ?? 0), 1);
          const reorderQty = Math.max(missing * 2, 1); // commande min 2x le manque
          setOrderingPartId(String(item.id));
          try {
            await createStockOrder({
              inventory_id: String(item.id),
              quantity: reorderQty,
              unit_price: Number(item.unit_price ?? 0),
              supplier: item.supplier || 'À définir',
              expected_delivery_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            });
            window.dispatchEvent(new CustomEvent('pipeline:refresh'));
          } catch {
            /* toast géré par supabaseCall */
          } finally {
            setOrderingPartId(null);
          }
        };

        return (
          <div className="flex flex-col h-full">
            {lowStockItems.length > 0 && !liveInventoryLoading && (
              <div className="mb-2 rounded border border-red-200 bg-red-50 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-semibold text-red-800">
                    {lowStockItems.length} référence{lowStockItems.length > 1 ? 's' : ''} sous seuil
                  </div>
                  <span className="text-[10px] text-red-600">Réappro recommandé</span>
                </div>
                <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
                  {lowStockItems.slice(0, 4).map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-gray-800">{item.title || item.category}</span>
                        <span className="ml-1 text-red-600">
                          {item.stock}/{item.minStock}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickReorder(item)}
                        disabled={orderingPartId === String(item.id)}
                        className="flex items-center gap-1 rounded bg-orange-600 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                        title={`Commander ${Math.max((item.minStock ?? 0) - (item.stock ?? 0), 1) * 2} unités auprès de ${item.supplier || 'fournisseur'}`}
                      >
                        <ShoppingCart className="h-3 w-3" />
                        {orderingPartId === String(item.id) ? '…' : 'Commander'}
                      </button>
                    </div>
                  ))}
                  {lowStockItems.length > 4 && (
                    <div className="text-center text-[10px] text-red-600">
                      +{lowStockItems.length - 4} autre{lowStockItems.length - 4 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            )}
            {liveInventoryLoading ? (
              <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
                Chargement du stock…
              </div>
            ) : inventoryData.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <div>Aucune pièce en stock</div>
                <div className="text-xs text-gray-400 mt-1">
                  Ajoutez des références dans le module Inventaire
                </div>
              </div>
            ) : (
              <ChartWidget
                widget={widget}
                data={inventoryData as any[]}
                widgetSize={widgetSize as any}
              />
            )}
          </div>
        );
      }
      if (widget.id === 'technician-workload') {
        if (liveWorkloadLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des techniciens…
            </div>
          );
        }
        const workloadData = liveWorkload ?? [];
        if (workloadData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <div>Aucun technicien enregistré</div>
              <div className="text-xs text-gray-400 mt-1">
                Ajoutez des techniciens dans Paramètres &gt; Équipe
              </div>
            </div>
          );
        }
        return (
          <ChartWidget
            widget={widget}
            data={workloadData as any[]}
            widgetSize={widgetSize as any}
          />
        );
      }
      if (widget.id === 'performance-analytics') {
        if (livePerformanceLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des analytics…
            </div>
          );
        }
        const perf = livePerformance ?? [];
        const totalCredit = perf.reduce((s, p: any) => s + (p.credit || 0), 0);
        const totalAssurance = perf.reduce((s, p: any) => s + (p.assurance || 0), 0);
        const totalPerf = totalCredit + totalAssurance;
        const lastMonth = perf[perf.length - 1] as any;
        const prevMonth = perf[perf.length - 2] as any;
        const growth = prevMonth && prevMonth.total > 0
          ? Math.round(((lastMonth.total - prevMonth.total) / prevMonth.total) * 100)
          : 0;
        if (totalPerf === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <div>Aucune commission sur les 6 derniers mois</div>
              <div className="text-xs text-gray-400 mt-1">
                Les analytics s'afficheront dès la première commission générée
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-purple-50 p-2">
                <div className="text-xs font-bold text-purple-700">{totalCredit.toLocaleString('fr-FR')}</div>
                <div className="text-[10px] text-purple-700/80">Crédit (6m)</div>
              </div>
              <div className="rounded bg-blue-50 p-2">
                <div className="text-xs font-bold text-blue-700">{totalAssurance.toLocaleString('fr-FR')}</div>
                <div className="text-[10px] text-blue-700/80">Assurance (6m)</div>
              </div>
              <div className={`rounded p-2 ${growth >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className={`text-xs font-bold ${growth >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {growth >= 0 ? '+' : ''}{growth}%
                </div>
                <div className={`text-[10px] ${growth >= 0 ? 'text-green-700/80' : 'text-red-700/80'}`}>vs mois -1</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWidget
                widget={widget}
                data={perf as any[]}
                widgetSize={widgetSize as any}
              />
            </div>
            <div className="px-1 pt-1 text-[10px] text-gray-400 text-right">
              Total commissions 6 mois : {totalPerf.toLocaleString('fr-FR')} MAD
            </div>
          </div>
        );
      }
      if (widget.id === 'transport-costs') {
        if (liveTransportCostsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des coûts…
            </div>
          );
        }
        const costs = liveTransportCosts ?? [];
        const totalCost = costs.reduce((s, c: any) => s + (c.cost || 0), 0);
        const totalTrips = costs.reduce((s, c: any) => s + (c.trips || 0), 0);
        const totalKm = costs.reduce((s, c: any) => s + (c.km || 0), 0);
        const avgPerTrip = totalTrips > 0 ? Math.round(totalCost / totalTrips) : 0;
        if (totalTrips === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <div>Aucune livraison sur les 6 derniers mois</div>
              <div className="text-xs text-gray-400 mt-1">
                Les coûts s'afficheront dès la première livraison
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-gray-50 p-2">
                <div className="text-xs font-bold text-gray-900">{totalCost.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-500">Total 6 mois</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-xs font-bold text-gray-900">{totalTrips}</div>
                <div className="text-[10px] text-gray-500">Livraisons</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-xs font-bold text-gray-900">{avgPerTrip.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-500">Coût moyen / livr.</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWidget
                widget={widget}
                data={costs as any[]}
                widgetSize={widgetSize as any}
              />
            </div>
            <div className="px-1 pt-1 text-[10px] text-gray-400 text-right">
              Distance totale : {totalKm.toLocaleString('fr-FR')} km
              {totalKm > 0 && (
                <> · <span className="font-semibold text-gray-600">Coût moyen : {Math.round(totalCost / totalKm).toLocaleString('fr-FR')} MAD/km</span></>
              )}
            </div>
          </div>
        );
      }
      if (widget.id === 'roi-analysis') {
        if (liveRoiAnalysisLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement de l'analyse ROI…
            </div>
          );
        }
        const roi = liveRoiAnalysis;
        if (!roi || roi.investments.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <TrendingUp className="h-10 w-10 text-gray-300 mb-2" />
              <div>Pas encore d'analyse ROI disponible</div>
              <div className="text-xs text-gray-400 mt-1">
                Ajoutez des investissements pour voir leur rentabilité
              </div>
            </div>
          );
        }
        const top3 = roi.investments.slice(0, 3);
        const avgRoi = roi.investments.length > 0
          ? Math.round((roi.investments.reduce((s, i) => s + i.roiAnnualized, 0) / roi.investments.length) * 10) / 10
          : 0;
        const negativeCount = roi.investments.filter((i) => i.roiAnnualized < 0).length;
        return (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className={`rounded p-2 ${avgRoi >= 8 ? 'bg-green-50' : avgRoi >= 4 ? 'bg-orange-50' : 'bg-red-50'}`}>
                <div className={`text-xs font-bold ${avgRoi >= 8 ? 'text-green-700' : avgRoi >= 4 ? 'text-orange-700' : 'text-red-700'}`}>
                  {avgRoi}%
                </div>
                <div className="text-[10px] text-gray-600">ROI annualisé moyen</div>
              </div>
              <div className="rounded bg-blue-50 p-2">
                <div className="text-xs font-bold text-blue-700">{roi.investments.length}</div>
                <div className="text-[10px] text-blue-700/80">Actifs analysés</div>
              </div>
              <div className={`rounded p-2 ${negativeCount === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className={`text-xs font-bold ${negativeCount === 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {negativeCount}
                </div>
                <div className="text-[10px] text-gray-600">ROI négatif</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWidget
                widget={widget}
                data={roi.chartData as any[]}
                widgetSize={widgetSize as any}
              />
            </div>
            <div className="mt-1 space-y-0.5 px-1 text-[10px]">
              <div className="font-semibold text-gray-700">Top 3 performances :</div>
              {top3.map((i) => (
                <div key={i.id} className="flex items-center justify-between">
                  <span className="truncate text-gray-600">{i.label}</span>
                  <span className={`font-bold ${i.roiAnnualized >= 8 ? 'text-green-700' : 'text-orange-700'}`}>
                    {i.roiAnnualized}%/an
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }
      if (widget.id === 'risk-assessment') {
        if (liveRiskAssessmentLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement de l'évaluation des risques…
            </div>
          );
        }
        const r = liveRiskAssessment;
        if (!r || r.chartData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Shield className="h-10 w-10 text-gray-300 mb-2" />
              <div>Pas d'évaluation de risque disponible</div>
              <div className="text-xs text-gray-400 mt-1">
                Ajoutez des investissements pour évaluer les risques
              </div>
            </div>
          );
        }
        const overallColor =
          r.overallRisk <= 3 ? 'text-green-700 bg-green-50'
          : r.overallRisk <= 6 ? 'text-orange-700 bg-orange-50'
          : 'text-red-700 bg-red-50';
        const overallLabel =
          r.overallRisk <= 3 ? 'Faible'
          : r.overallRisk <= 6 ? 'Modéré'
          : r.overallRisk <= 8 ? 'Élevé'
          : 'Critique';
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Shield className="h-3.5 w-3.5 text-orange-600" />
                <span>Risque agrégé portefeuille</span>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${overallColor}`}>
                {overallLabel} · {r.overallRisk}/10
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWidget
                widget={widget}
                data={r.chartData as any[]}
                widgetSize={widgetSize as any}
              />
            </div>
            <div className="mt-1 space-y-0.5 px-1 text-[10px]">
              {r.concentrations.length > 0 && r.concentrations[0].percent > 40 && (
                <div className="text-amber-700">
                  ⚠ Concentration {r.concentrations[0].category} : {Math.round(r.concentrations[0].percent)}%
                </div>
              )}
              {r.financingDependencyPercent > 60 && (
                <div className="text-amber-700">
                  ⚠ Charge financement : {r.financingDependencyPercent}% des revenus
                </div>
              )}
              {r.ageRiskCount > 0 && (
                <div className="text-gray-500">
                  {r.ageRiskCount} actif{r.ageRiskCount > 1 ? 's' : ''} de plus de 8 ans
                </div>
              )}
              {r.lowOccupancyCount > 0 && (
                <div className="text-gray-500">
                  {r.lowOccupancyCount} actif{r.lowOccupancyCount > 1 ? 's' : ''} sans revenu mensuel
                </div>
              )}
            </div>
          </div>
        );
      }
      if (widget.id === 'import-export-stats') {
        if (liveImportExportStatsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement des statistiques I/E…
            </div>
          );
        }
        const ie = liveImportExportStats;
        if (!ie || ie.chartData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Ship className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune donnée import/export</div>
              <div className="text-xs text-gray-400 mt-1">Exécutez le script SQL transitaire et saisissez des volumes mensuels</div>
            </div>
          );
        }
        const growthColor = ie.teuGrowth >= 0 ? 'text-green-700' : 'text-red-700';
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Ship className="h-3.5 w-3.5 text-teal-600" />
                <span>TEU cumulés Import + Export</span>
              </div>
              <span className={`text-xs font-bold ${growthColor}`}>
                {ie.teuGrowth >= 0 ? '+' : ''}{ie.teuGrowth}% vs mois préc.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-cyan-50 p-2">
                <div className="text-xs font-bold text-cyan-800">{ie.latestImportTeu}</div>
                <div className="text-[10px] text-cyan-800/80">TEU import (mois)</div>
              </div>
              <div className="rounded bg-indigo-50 p-2">
                <div className="text-xs font-bold text-indigo-800">{ie.latestExportTeu}</div>
                <div className="text-[10px] text-indigo-800/80">TEU export (mois)</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChartWidget widget={widget} data={ie.chartData as any[]} widgetSize={widgetSize as any} />
            </div>
          </div>
        );
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
              <div className="text-xs text-gray-400 mt-1">Déployez sql/deploy_logisticien.sql</div>
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
                <div className="text-[11px] font-bold text-emerald-800">{k.latestOnTime}%</div>
                <div className="text-[9px] text-emerald-800/80">À temps</div>
              </div>
              <div className="rounded bg-teal-50 p-1.5">
                <div className="text-[11px] font-bold text-teal-800">{k.latestFillRate}%</div>
                <div className="text-[9px] text-teal-800/80">Remplissage</div>
              </div>
              <div className="rounded bg-orange-50 p-1.5">
                <div className="text-[11px] font-bold text-orange-800">{k.latestLeadDays}j</div>
                <div className="text-[9px] text-orange-800/80">Délai moy.</div>
              </div>
            </div>
            {k.latestIncidents > 0 && (
              <div className="mx-1 mb-1 rounded bg-red-50 px-2 py-0.5 text-center text-[10px] font-medium text-red-700">
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
        if (liveDemurrageLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement des surestaries…
            </div>
          );
        }
        const dem = liveDemurrage;
        if (!dem || dem.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Ship className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun conteneur suivi</div>
              <div className="text-xs text-gray-400 mt-1">Renseignez date d'arrivée, franchise et tarif/jour sur vos conteneurs</div>
            </div>
          );
        }
        const overdue = dem.items.filter((i) => i.daysOver > 0 && !i.returned);
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className={`rounded p-2 ${dem.totalCost > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${dem.totalCost > 0 ? 'text-red-700' : 'text-green-700'}`}>{dem.totalCost.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Exposition surestaries</div>
              </div>
              <div className="rounded bg-amber-50 p-2">
                <div className="text-sm font-bold text-amber-700">{dem.inDemurrageCount}</div>
                <div className="text-[10px] text-amber-700/80">En dépassement</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{dem.maxDaysOver} j</div>
                <div className="text-[10px] text-gray-600">Pire dépassement</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {(overdue.length ? overdue : dem.items).slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{i.container_number}</div>
                    <div className="text-[10px] text-gray-500">{i.status}{i.port ? ' · ' + i.port : ''} · franchise → {i.freeUntil}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {i.daysOver > 0 ? (
                      <>
                        <div className="font-bold text-red-700">+{i.daysOver} j</div>
                        <div className="text-[10px] text-red-600">{i.cost.toLocaleString('fr-FR')} MAD</div>
                      </>
                    ) : (
                      <div className="text-[10px] text-green-700">Dans la franchise</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {dem.watchCount > 0 && (
              <div className="px-1 pt-1 text-[10px] text-gray-400 text-right">{dem.watchCount} conteneur(s) dans la franchise à surveiller</div>
            )}
          </div>
        );
      }
      if (widget.id === 'rental-overdue') {
        if (liveRentalOverdueLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des impayés…
            </div>
          );
        }
        const ovd = liveRentalOverdue;
        if (!ovd || ovd.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <DollarSign className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun loyer impayé</div>
              <div className="text-xs text-gray-400 mt-1">Trésorerie à jour, ou renseignez vos factures de location (échéance + montant) pour suivre les retards</div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className={`rounded p-2 ${ovd.totalOverdue > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${ovd.totalOverdue > 0 ? 'text-red-700' : 'text-green-700'}`}>{ovd.totalOverdue.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Total impayé</div>
              </div>
              <div className="rounded bg-amber-50 p-2">
                <div className="text-sm font-bold text-amber-700">{ovd.overdueCount}</div>
                <div className="text-[10px] text-amber-700/80">Factures en retard</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{ovd.maxDaysLate} j</div>
                <div className="text-[10px] text-gray-600">Pire retard</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-amber-50/60 p-1.5">
                <div className="text-xs font-bold text-amber-700">{ovd.bucket0_30.toLocaleString('fr-FR')}</div>
                <div className="text-[10px] text-gray-600">0-30 j</div>
              </div>
              <div className="rounded bg-orange-50 p-1.5">
                <div className="text-xs font-bold text-orange-700">{ovd.bucket31_60.toLocaleString('fr-FR')}</div>
                <div className="text-[10px] text-gray-600">31-60 j</div>
              </div>
              <div className="rounded bg-red-50 p-1.5">
                <div className="text-xs font-bold text-red-700">{ovd.bucket60plus.toLocaleString('fr-FR')}</div>
                <div className="text-[10px] text-gray-600">60 j+</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {ovd.items.slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{i.clientName}</div>
                    <div className="text-[10px] text-gray-500">{i.invoiceNumber}{i.dueDate ? ' · éch. ' + i.dueDate : ''}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-bold text-red-700">{i.remaining.toLocaleString('fr-FR')} MAD</div>
                    <div className={`text-[10px] ${i.bucket === '60+' ? 'text-red-600' : i.bucket === '31-60' ? 'text-orange-600' : 'text-amber-600'}`}>+{i.daysLate} j de retard</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      if (widget.id === 'logistics-profitability') {
        if (liveLogisticsProfitLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement de la rentabilité…
            </div>
          );
        }
        const prof = liveLogisticsProfit;
        if (!prof || prof.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Wallet className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune opération chiffrée</div>
              <div className="text-xs text-gray-400 mt-1">Renseignez coût transport, coût entreposage et montant facturé sur vos routes</div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className={`rounded p-2 ${prof.totalMargin >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className={`text-sm font-bold ${prof.totalMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>{prof.totalMargin.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Marge globale ({prof.marginPct}%)</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{prof.totalCost.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Coût total</div>
              </div>
              <div className={`rounded p-2 ${prof.unprofitableCount > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${prof.unprofitableCount > 0 ? 'text-red-700' : 'text-green-700'}`}>{prof.unprofitableCount}</div>
                <div className="text-[10px] text-gray-600">Livraisons à perte</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {prof.items.slice(0, 8).map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{i.route_ref}{i.lane ? ' · ' + i.lane : ''}</div>
                    <div className="text-[10px] text-gray-500">{i.status} · coût {i.totalCost.toLocaleString('fr-FR')} · facturé {i.revenue.toLocaleString('fr-FR')} MAD</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`font-bold ${i.margin < 0 ? 'text-red-700' : 'text-green-700'}`}>{i.margin >= 0 ? '+' : ''}{i.margin.toLocaleString('fr-FR')} MAD</div>
                    <div className={`text-[10px] ${i.margin < 0 ? 'text-red-600' : 'text-gray-500'}`}>{i.marginPct}%</div>
                  </div>
                </div>
              ))}
            </div>
            {prof.unprofitableCount > 0 && (
              <div className="px-1 pt-1 text-[10px] text-red-500 text-right">{prof.unprofitableCount} livraison(s) à perte · {prof.unprofitableLoss.toLocaleString('fr-FR')} MAD</div>
            )}
          </div>
        );
      }
      if (widget.id === 'deadhead-cost') {
        if (liveDeadheadLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement des km à vide…
            </div>
          );
        }
        const dh = liveDeadhead;
        if (!dh || dh.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Truck className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun trajet chiffré</div>
              <div className="text-xs text-gray-400 mt-1">Renseignez km en charge, km à vide et coût/km sur vos livraisons pour suivre le retour à vide</div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className={`rounded p-2 ${dh.totalEmptyCost > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${dh.totalEmptyCost > 0 ? 'text-red-700' : 'text-green-700'}`}>{dh.totalEmptyCost.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Coût du vide</div>
              </div>
              <div className={`rounded p-2 ${dh.globalEmptyRate > dh.threshold ? 'bg-red-50' : dh.globalEmptyRate > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${dh.globalEmptyRate > dh.threshold ? 'text-red-700' : dh.globalEmptyRate > 0 ? 'text-amber-700' : 'text-green-700'}`}>{dh.globalEmptyRate}%</div>
                <div className="text-[10px] text-gray-600">Taux de vide global</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{dh.totalEmptyKm.toLocaleString('fr-FR')} km</div>
                <div className="text-[10px] text-gray-600">Km à vide cumulés</div>
              </div>
            </div>
            {dh.aboveThresholdCount > 0 && (
              <div className="px-1 pb-2 flex items-center gap-1 text-[10px] text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {dh.aboveThresholdCount} trajet(s) au-dessus de {dh.threshold}% de retour à vide
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {dh.items.slice(0, 8).map((i) => (
                <div key={i.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${i.overThreshold ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{i.label}{i.client ? ' · ' + i.client : ''}</div>
                    <div className="text-[10px] text-gray-500">{i.status} · {i.loadedKm} km charge / {i.emptyKm} km vide{i.destination ? ' · ' + i.destination : ''}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`font-bold ${i.overThreshold ? 'text-red-700' : 'text-amber-700'}`}>{i.emptyRate}%</div>
                    <div className={`text-[10px] ${i.overThreshold ? 'text-red-600' : 'text-gray-500'}`}>{i.emptyCost.toLocaleString('fr-FR')} MAD</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      if (widget.id === 'bank-comparator') {
        if (liveBankComparisonLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Comparaison des offres bancaires…
            </div>
          );
        }
        const cmp = liveBankComparison;
        if (!cmp || cmp.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Landmark className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune banque partenaire configurée</div>
              <div className="text-xs text-gray-400 mt-1">Ajoutez vos baremes bancaires (taux, duree max, frais) dans la table bank_offers</div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-green-50 p-2">
                <div className="text-sm font-bold text-green-700 truncate">{cmp.bestBankName || '—'}</div>
                <div className="text-[10px] text-gray-600">Meilleure offre</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{cmp.bestMonthlyPayment.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Mensualite mini</div>
              </div>
              <div className={`rounded p-2 ${cmp.savingsVsWorst > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                <div className={`text-sm font-bold ${cmp.savingsVsWorst > 0 ? 'text-green-700' : 'text-gray-900'}`}>{cmp.savingsVsWorst.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Économie vs pire</div>
              </div>
            </div>
            <div className="px-1 pb-1 text-[10px] text-gray-500">
              {cmp.usingRealApp
                ? <>Sur demande : <span className="font-medium text-gray-700">{cmp.refLabel || 'derniere demande'}</span> · {cmp.refAmount.toLocaleString('fr-FR')} MAD / {cmp.refDuration} mois</>
                : <>Montant de reference : {cmp.refAmount.toLocaleString('fr-FR')} MAD / {cmp.refDuration} mois (aucune demande enregistree)</>}
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {cmp.items.slice(0, 8).map((b) => (
                <div key={b.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${b.isBest ? 'border-green-300 bg-green-50' : b.eligible ? 'border-gray-100 bg-white' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">
                      {b.bankName}{b.isBest && <span className="ml-1 text-[10px] font-semibold text-green-700">• Recommandée</span>}
                    </div>
                    <div className="text-[10px] text-gray-500">Taux {b.annualRate.toLocaleString('fr-FR')}% · {b.durationMonths} mois{b.fileFees > 0 ? ' · frais ' + b.fileFees.toLocaleString('fr-FR') + ' MAD' : ''}{!b.eligible ? ' · hors criteres' : ''}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`font-bold ${b.isBest ? 'text-green-700' : 'text-gray-900'}`}>{b.monthlyPayment.toLocaleString('fr-FR')} MAD/mois</div>
                    <div className="text-[10px] text-gray-500">Cout credit {b.totalCost.toLocaleString('fr-FR')} MAD</div>
                  </div>
                </div>
              ))}
            </div>
            {cmp.eligibleCount < cmp.bankCount && (
              <div className="px-1 pt-1 text-[10px] text-amber-600 text-right">{cmp.bankCount - cmp.eligibleCount} banque(s) hors criteres (montant/duree)</div>
            )}
          </div>
        );
      }
      if (widget.id === 'yield-realized-vs-expected') {
        if (liveYieldGapLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2" />
              Chargement du rendement…
            </div>
          );
        }
        const yg = liveYieldGap;
        if (!yg || yg.items.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Target className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun rendement à comparer</div>
              <div className="text-xs text-gray-400 mt-1">Renseignez le revenu attendu (loyer cible ou rendement %) et le revenu encaissé de vos actifs détenus</div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-3 gap-2 px-1 pb-2 text-center">
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{yg.totalExpected.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Revenu attendu</div>
              </div>
              <div className="rounded bg-gray-50 p-2">
                <div className="text-sm font-bold text-gray-900">{yg.totalRealized.toLocaleString('fr-FR')} MAD</div>
                <div className="text-[10px] text-gray-600">Revenu réalisé</div>
              </div>
              <div className={`rounded p-2 ${yg.totalGap < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-sm font-bold ${yg.totalGap < 0 ? 'text-red-700' : 'text-green-700'}`}>{yg.totalGap >= 0 ? '+' : ''}{yg.totalGap.toLocaleString('fr-FR')} MAD</div>
                <div className={`text-[10px] ${yg.totalGap < 0 ? 'text-red-600' : 'text-green-700/80'}`}>Écart global ({yg.totalGapPercent >= 0 ? '+' : ''}{yg.totalGapPercent}%)</div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto space-y-1 px-1">
              {yg.items.slice(0, 8).map((i) => (
                <div key={i.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${i.underperforming ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{i.label}</div>
                    <div className="text-[10px] text-gray-500">{i.status} · attendu {i.expectedRevenue.toLocaleString('fr-FR')} · réalisé {i.realizedRevenue.toLocaleString('fr-FR')} MAD · {i.monthsHeld} mois</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`font-bold ${i.gap < 0 ? 'text-red-700' : 'text-green-700'}`}>{i.gap >= 0 ? '+' : ''}{i.gap.toLocaleString('fr-FR')} MAD</div>
                    <div className={`text-[10px] ${i.gap < 0 ? 'text-red-600' : 'text-gray-500'}`}>{i.gapPercent >= 0 ? '+' : ''}{i.gapPercent}%</div>
                  </div>
                </div>
              ))}
            </div>
            {yg.underperformingCount > 0 && (
              <div className="px-1 pt-1 text-[10px] text-red-500 text-right">{yg.underperformingCount} actif(s) sous-performant(s) · {Math.abs(yg.shortfall).toLocaleString('fr-FR')} MAD de manque à gagner</div>
            )}
          </div>
        );
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
        const credits = liveCreditApps ?? [];
        const inProgress = credits.filter((c) => c.status === 'En cours' || c.status === 'Brouillon').length;
        const approved = credits.filter((c) => c.status === 'Approuvé').length;
        const disbursed = credits.filter((c) => c.status === 'Décaissé').length;
        const refused = credits.filter((c) => c.status === 'Refusé').length;
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <FileText className="h-3.5 w-3.5 text-orange-600" />
                <span>{credits.length} demandes</span>
                {inProgress > 0 && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                    {inProgress} en cours
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCreditForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
              >
                <Plus className="h-3 w-3" />
                Nouvelle demande
              </button>
            </div>
            {liveCreditAppsLoading ? (
              <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
                Chargement…
              </div>
            ) : credits.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <div>Aucune demande de crédit</div>
                <button
                  type="button"
                  onClick={() => setShowCreditForm(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                >
                  <Plus className="h-3 w-3" />
                  Créer la première demande
                </button>
              </div>
            ) : (
              <>
                <div className="mb-2 grid grid-cols-4 gap-1 text-center text-[10px]">
                  <div className="rounded bg-blue-50 py-1"><div className="font-bold text-blue-700">{inProgress}</div><div className="text-blue-700/70">En cours</div></div>
                  <div className="rounded bg-green-50 py-1"><div className="font-bold text-green-700">{approved}</div><div className="text-green-700/70">Approuvés</div></div>
                  <div className="rounded bg-purple-50 py-1"><div className="font-bold text-purple-700">{disbursed}</div><div className="text-purple-700/70">Décaissés</div></div>
                  <div className="rounded bg-red-50 py-1"><div className="font-bold text-red-700">{refused}</div><div className="text-red-700/70">Refusés</div></div>
                </div>
                <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
                  {credits.slice(0, 15).map((c) => {
                    const statusColor =
                      c.status === 'Décaissé' ? 'bg-purple-100 text-purple-700'
                      : c.status === 'Approuvé' ? 'bg-green-100 text-green-700'
                      : c.status === 'Refusé' ? 'bg-red-100 text-red-700'
                      : c.status === 'Annulé' ? 'bg-gray-100 text-gray-600'
                      : 'bg-blue-100 text-blue-700';
                    return (
                      <div key={c.id} className="rounded border border-gray-200 bg-white p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-gray-900">{c.equipment_label}</div>
                            <div className="truncate text-[10px] text-gray-500">
                              {c.client_name_snapshot || '—'} {c.bank_name ? `· ${c.bank_name}` : ''}
                              {c.reference ? ` · ${c.reference}` : ''}
                            </div>
                          </div>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusColor}`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                          <span>
                            <span className="font-semibold text-gray-900">{Number(c.requested_amount || 0).toLocaleString('fr-FR')} MAD</span>
                            {c.duration_months ? ` · ${c.duration_months} mois` : ''}
                            {c.interest_rate ? ` · ${c.interest_rate}%` : ''}
                          </span>
                          {c.commission_amount && (
                            <span className="font-medium text-orange-700" title="Votre commission">
                              +{Number(c.commission_amount).toLocaleString('fr-FR')} MAD
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <QuickCreditApplicationForm
              open={showCreditForm}
              onClose={() => setShowCreditForm(false)}
              onCreated={() => {
                setLiveCreditAppsLoading(true);
                getCreditApplications().then(setLiveCreditApps).catch(() => {}).finally(() => setLiveCreditAppsLoading(false));
              }}
            />
          </div>
        );
      }
      if (widget.id === 'insurance-policies') {
        const policies = livePolicies ?? [];
        const now = Date.now();
        const expiringSoon = policies.filter((p) => {
          if (!p.end_date) return false;
          const days = (new Date(p.end_date).getTime() - now) / (1000 * 3600 * 24);
          return days > 0 && days <= 30;
        });
        const expired = policies.filter((p) => p.status === 'Expirée').length;

        const handleRenew = async (policyId: string) => {
          if (renewingPolicyId) return;
          setRenewingPolicyId(policyId);
          try {
            await renewInsurancePolicy(policyId, 1);
            window.dispatchEvent(new CustomEvent('pipeline:refresh'));
          } catch { /* toast géré */ } finally { setRenewingPolicyId(null); }
        };

        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Shield className="h-3.5 w-3.5 text-orange-600" />
                <span>{policies.length} polices</span>
                {expiringSoon.length > 0 && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    {expiringSoon.length} échéance &lt; 30j
                  </span>
                )}
                {expired > 0 && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    {expired} expirées
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowInsuranceForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
              >
                <Plus className="h-3 w-3" />
                Nouvelle police
              </button>
            </div>
            {livePoliciesLoading ? (
              <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
                Chargement…
              </div>
            ) : policies.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <Shield className="h-10 w-10 text-gray-300 mb-2" />
                <div>Aucune police d'assurance</div>
                <button
                  type="button"
                  onClick={() => setShowInsuranceForm(true)}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                >
                  <Plus className="h-3 w-3" />
                  Créer la première police
                </button>
              </div>
            ) : (
              <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
                {policies.slice(0, 20).map((p) => {
                  const days = p.end_date
                    ? Math.round((new Date(p.end_date).getTime() - now) / (1000 * 3600 * 24))
                    : null;
                  const isExpiringSoon = days != null && days > 0 && days <= 30;
                  const isExpired = p.status === 'Expirée' || (days != null && days < 0);
                  const statusColor = isExpired
                    ? 'bg-red-100 text-red-700'
                    : isExpiringSoon
                    ? 'bg-amber-100 text-amber-700'
                    : p.status === 'Active' || p.status === 'En cours'
                    ? 'bg-green-100 text-green-700'
                    : p.status === 'Devis'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600';
                  return (
                    <div key={p.id} className="rounded border border-gray-200 bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-gray-900">{p.policy_type}</span>
                            <span className="text-[10px] text-gray-400">— {p.insurer_name}</span>
                          </div>
                          <div className="truncate text-[10px] text-gray-500">
                            {p.client_name_snapshot || '—'}
                            {p.equipment_label ? ` · ${p.equipment_label}` : ''}
                            {p.policy_number ? ` · ${p.policy_number}` : ''}
                          </div>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusColor}`}>
                          {isExpired ? 'Expirée' : isExpiringSoon ? `${days}j` : p.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                        <span>
                          Prime <span className="font-semibold text-gray-900">{Number(p.annual_premium || 0).toLocaleString('fr-FR')} MAD</span>
                          {p.payment_frequency ? ` / an · ${p.payment_frequency.toLowerCase()}` : ''}
                        </span>
                        <span className="flex items-center gap-2">
                          {p.commission_amount && (
                            <span className="font-medium text-orange-700">+{Number(p.commission_amount).toLocaleString('fr-FR')} MAD</span>
                          )}
                          {(isExpiringSoon || isExpired) && (
                            <button
                              type="button"
                              onClick={() => handleRenew(p.id)}
                              disabled={renewingPolicyId === p.id}
                              className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                              title="Renouveler 1 an"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              {renewingPolicyId === p.id ? '…' : 'Renouveler'}
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <QuickInsurancePolicyForm
              open={showInsuranceForm}
              onClose={() => setShowInsuranceForm(false)}
              onCreated={() => {
                setLivePoliciesLoading(true);
                getInsurancePolicies().then(setLivePolicies).catch(() => {}).finally(() => setLivePoliciesLoading(false));
              }}
            />
          </div>
        );
      }
      if (widget.id === 'client-portfolio') {
        const portfolio = liveClientPortfolio ?? [];
        if (liveClientPortfolioLoading) {
          return (
            <div className="flex flex-1 items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement portefeuille…
            </div>
          );
        }
        if (portfolio.length === 0) {
          return (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Building2 className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucun client enregistré</div>
              <div className="text-xs text-gray-400 mt-1">
                Créez vos premiers clients via l'onglet Clients
              </div>
            </div>
          );
        }
        const sortedPortfolio = [...portfolio].sort((a: any, b: any) => (b.totalCommission || 0) - (a.totalCommission || 0));
        const actifs = portfolio.filter((c: any) => c.status === 'Actif').length;
        const prospects = portfolio.filter((c: any) => c.status === 'Prospect').length;
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
              <span>
                <span className="font-medium text-gray-900">{portfolio.length}</span> clients ·{' '}
                <span className="text-green-700">{actifs} actifs</span>
                {prospects > 0 && <span className="text-blue-700"> · {prospects} prospects</span>}
              </span>
            </div>
            <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto pr-1">
              {sortedPortfolio.slice(0, 20).map((c: any) => (
                <div key={c.id} className="rounded border border-gray-200 bg-white p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-gray-900">
                        {c.company_name || c.name}
                      </div>
                      <div className="truncate text-[10px] text-gray-500">
                        {c.type}
                        {c.sector ? ` · ${c.sector}` : ''}
                        {c.city ? ` · ${c.city}` : ''}
                      </div>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                      c.status === 'Actif' ? 'bg-green-100 text-green-700'
                      : c.status === 'Prospect' ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                    <span className="flex items-center gap-2">
                      {c.activeCredits > 0 && (
                        <span className="flex items-center gap-0.5"><FileText className="h-2.5 w-2.5 text-purple-600" />{c.activeCredits}</span>
                      )}
                      {c.activePolicies > 0 && (
                        <span className="flex items-center gap-0.5"><Shield className="h-2.5 w-2.5 text-blue-600" />{c.activePolicies}</span>
                      )}
                      {c.activeCredits === 0 && c.activePolicies === 0 && (
                        <span className="text-gray-400 italic">aucun produit</span>
                      )}
                    </span>
                    {c.totalCommission > 0 && (
                      <span className="font-medium text-orange-700" title="Total commission générée">
                        {Number(c.totalCommission).toLocaleString('fr-FR')} MAD
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
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
                          <div className="truncate text-[10px] text-gray-500">
                            {o.source}
                            {o.contact_name ? ` · ${o.contact_name}` : ''}
                            {o.reference ? ` · ${o.reference}` : ''}
                          </div>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${recoColor}`}>
                          {o.recommendation}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
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
                            <span className={`text-[10px] font-medium ${isExpired ? 'text-red-600' : 'text-amber-700'}`}>
                              {isExpired ? 'Expirée' : `${days}j`}
                            </span>
                          )}
                          {(o.recommendation === 'Acheter' || o.recommendation === 'Étudier') && o.status !== 'Convertie' && (
                            <button
                              type="button"
                              onClick={() => handleConvert(o.id)}
                              disabled={convertingOpportunityId === o.id}
                              className="flex items-center gap-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition hover:bg-orange-700 disabled:bg-gray-300"
                              title="Convertir en investissement réel"
                            >
                              <ArrowRight className="h-2.5 w-2.5" />
                              {convertingOpportunityId === o.id ? '…' : 'Acheter'}
                            </button>
                          )}
                        </span>
                      </div>
                      {o.risk_factors && (
                        <div className="mt-1 truncate text-[10px] text-gray-500 italic" title={o.risk_factors}>
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
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{urgent} urgent{urgent > 1 ? 's' : ''}</span>
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
              <div className="mt-1 px-1 text-[10px] text-amber-700">{pending} en attente / brouillon</div>
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
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">{urgent} urgent{urgent > 1 ? 's' : ''}</span>
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
        if (liveCustomsMetricsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des déclarations…
            </div>
          );
        }
        const c = liveCustomsMetrics ?? { openCount: 0, inProgress: 0, blocked: 0, delayed: 0, totalValueOpen: 0, totalDeclarations: 0, liquidated: 0 };
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
              <Anchor className="h-3.5 w-3.5 text-teal-600" />
              <span>Déclarations douanières actives</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900">{c.openCount}</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  dossiers ouverts · {c.totalDeclarations} dossiers au total
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded bg-blue-50 p-2">
                  <div className="text-xs font-bold text-blue-800">{c.inProgress}</div>
                  <div className="text-[10px] text-blue-700/80">En cours</div>
                </div>
                <div className="rounded bg-amber-50 p-2">
                  <div className="text-xs font-bold text-amber-800">{c.blocked}</div>
                  <div className="text-[10px] text-amber-800/80">Bloqués</div>
                </div>
                <div className="rounded bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-800">{c.delayed}</div>
                  <div className="text-[10px] text-red-800/80">En retard</div>
                </div>
              </div>
              {c.totalValueOpen > 0 && (
                <div className="mt-3 w-full rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-center text-[11px] text-gray-700">
                  Valeur déclarée (ouverts) : <strong>{c.totalValueOpen.toLocaleString('fr-FR')} MAD</strong>
                </div>
              )}
              <div className="mt-1 text-[10px] text-gray-400">{c.liquidated} liquidée{c.liquidated > 1 ? 's' : ''}</div>
            </div>
          </div>
        );
      }
      if (widget.id === 'warehouse-occupancy') {
        if (liveWarehouseOccupancyLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mr-2" />
              Chargement des entrepôts…
            </div>
          );
        }
        const w = liveWarehouseOccupancy ?? {
          warehouseCount: 0,
          weightedOccupancyPct: 0,
          criticalWarehouses: 0,
          maintenanceWarehouses: 0,
          totalCapacityPallets: 0,
          totalUsedPallets: 0,
        };
        const pctColor =
          w.weightedOccupancyPct >= 92 ? 'text-red-700'
          : w.weightedOccupancyPct >= 78 ? 'text-amber-700'
          : 'text-emerald-700';
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
              <Building2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Occupation réseau entrepôts</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className={`text-center text-4xl font-bold ${pctColor}`}>
                {w.weightedOccupancyPct}%
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {w.warehouseCount} site{w.warehouseCount > 1 ? 's' : ''} · {w.totalUsedPallets.toLocaleString('fr-FR')} /{' '}
                {w.totalCapacityPallets.toLocaleString('fr-FR')} palettes
              </div>
              <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
                <div className="rounded bg-amber-50 p-2">
                  <div className="text-xs font-bold text-amber-800">{w.criticalWarehouses}</div>
                  <div className="text-[10px] text-amber-800/80">Critique / saturé</div>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <div className="text-xs font-bold text-slate-700">{w.maintenanceWarehouses}</div>
                  <div className="text-[10px] text-slate-600">Hors prod.</div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      if (widget.id === 'portfolio-value') {
        if (livePortfolioValueLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement du portefeuille…
            </div>
          );
        }
        const p = livePortfolioValue;
        if (!p || p.totalCount === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Briefcase className="h-10 w-10 text-gray-300 mb-2" />
              <div>Portefeuille vide</div>
              <button
                type="button"
                onClick={() => setShowInvestmentForm(true)}
                className="mt-2 inline-flex items-center gap-1 rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
              >
                <Plus className="h-3 w-3" />
                Premier investissement
              </button>
              <QuickInvestmentForm open={showInvestmentForm} onClose={() => setShowInvestmentForm(false)} onCreated={() => {
                setLivePortfolioValueLoading(true);
                getPortfolioValue().then(setLivePortfolioValue).catch(() => {}).finally(() => setLivePortfolioValueLoading(false));
              }} />
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Briefcase className="h-3.5 w-3.5 text-orange-600" />
                <span>Valeur portefeuille</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInvestmentForm(true)}
                className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-orange-700"
              >
                <Plus className="h-3 w-3" />
                Nouvel actif
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {(p.totalMarketValue / 1000000).toFixed(2)} <span className="text-base text-gray-500">M MAD</span>
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {p.activeCount} actifs · cash flow net {p.monthlyNet.toLocaleString('fr-FR')} MAD/mois
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
                <div className={`rounded p-2 ${p.unrealizedGain >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className={`text-xs font-bold ${p.unrealizedGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {p.unrealizedGain >= 0 ? '+' : ''}{Math.round(p.unrealizedGain / 1000).toLocaleString('fr-FR')}k
                  </div>
                  <div className={`text-[10px] ${p.unrealizedGain >= 0 ? 'text-green-700/80' : 'text-red-700/80'}`}>
                    PV latente ({p.unrealizedGainPercent}%)
                  </div>
                </div>
                <div className="rounded bg-blue-50 p-2">
                  <div className="text-xs font-bold text-blue-700">{Math.round(p.totalRevenue / 1000).toLocaleString('fr-FR')}k</div>
                  <div className="text-[10px] text-blue-700/80">Revenus cumulés</div>
                </div>
              </div>
              {p.soldCount > 0 && (
                <div className={`mt-2 rounded px-2 py-1 text-[11px] font-medium ${p.realizedGain >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {p.soldCount} cédé{p.soldCount > 1 ? 's' : ''} · PV réalisée {p.realizedGain >= 0 ? '+' : ''}{Math.round(p.realizedGain / 1000)}k MAD
                </div>
              )}
            </div>
            <QuickInvestmentForm open={showInvestmentForm} onClose={() => setShowInvestmentForm(false)} onCreated={() => {
              setLivePortfolioValueLoading(true);
              getPortfolioValue().then(setLivePortfolioValue).catch(() => {}).finally(() => setLivePortfolioValueLoading(false));
            }} />
          </div>
        );
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
                <div className="mt-0.5 text-[11px] text-gray-500">
                  actives · {(o.totalValue / 1000000).toFixed(2)} M MAD · ROI moyen {o.avgRoi}%
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded bg-green-50 p-2">
                  <div className="text-xs font-bold text-green-700">{o.recommendBuy}</div>
                  <div className="text-[10px] text-green-700/80">À acheter</div>
                </div>
                <div className="rounded bg-orange-50 p-2">
                  <div className="text-xs font-bold text-orange-700">{o.recommendStudy}</div>
                  <div className="text-[10px] text-orange-700/80">À étudier</div>
                </div>
                <div className="rounded bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-700">{o.highRisk}</div>
                  <div className="text-[10px] text-red-700/80">Haut risque</div>
                </div>
              </div>
              {o.expiringIn7d > 0 && (
                <div className="mt-2 flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                  <Clock className="h-3 w-3" />
                  {o.expiringIn7d} expire{o.expiringIn7d > 1 ? 'nt' : ''} dans 7 jours
                </div>
              )}
              <div className="mt-2 text-[10px] text-gray-500">
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
        if (liveCommissionsLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement des commissions…
            </div>
          );
        }
        const c = liveCommissions ?? { totalCommission: 0, creditCommission: 0, policyCommission: 0, monthCommission: 0, creditMonth: 0, policyMonth: 0, commissionDue: 0, commissionEarned: 0, creditCount: 0, policyCount: 0 };
        const policyShare = c.totalCommission > 0 ? Math.round((c.policyCommission / c.totalCommission) * 100) : 0;
        const creditShare = c.totalCommission > 0 ? Math.round((c.creditCommission / c.totalCommission) * 100) : 0;
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-1 pb-2 text-xs text-gray-600">
              <DollarSign className="h-3.5 w-3.5 text-orange-600" />
              <span>Commissions cumulées</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-2">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{Math.round(c.totalCommission).toLocaleString('fr-FR')} <span className="text-base text-gray-500">MAD</span></div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {c.creditCount + c.policyCount} dossiers · {Math.round(c.monthCommission).toLocaleString('fr-FR')} MAD ce mois
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
                <div className="rounded bg-purple-50 p-2">
                  <div className="flex items-center justify-center gap-1 text-purple-700">
                    <FileText className="h-3 w-3" />
                    <span className="text-xs font-bold">{Math.round(c.creditCommission).toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="text-[10px] text-purple-700/80">Crédit ({creditShare}%)</div>
                  <div className="text-[10px] text-purple-700/60">{c.creditCount} dossiers</div>
                </div>
                <div className="rounded bg-blue-50 p-2">
                  <div className="flex items-center justify-center gap-1 text-blue-700">
                    <Shield className="h-3 w-3" />
                    <span className="text-xs font-bold">{Math.round(c.policyCommission).toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="text-[10px] text-blue-700/80">Assurance ({policyShare}%)</div>
                  <div className="text-[10px] text-blue-700/60">{c.policyCount} polices</div>
                </div>
              </div>
              {c.totalCommission > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100">
                  <div className="flex h-full">
                    <div className="bg-purple-500" style={{ width: `${creditShare}%` }} />
                    <div className="bg-blue-500" style={{ width: `${policyShare}%` }} />
                  </div>
                </div>
              )}
              {(c.commissionDue > 0 || c.commissionEarned > 0) && (
                <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
                  <div className="rounded bg-green-50 p-2">
                    <div className="text-xs font-bold text-green-700">{Math.round(c.commissionEarned).toLocaleString('fr-FR')} MAD</div>
                    <div className="text-[10px] text-green-700/80">Encaissées (décaissé)</div>
                  </div>
                  <div className="rounded bg-amber-50 p-2">
                    <div className="text-xs font-bold text-amber-700">{Math.round(c.commissionDue).toLocaleString('fr-FR')} MAD</div>
                    <div className="text-[10px] text-amber-700/80">Dues — à recouvrer</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
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
                  <div className="text-[10px] text-orange-700/80">En route</div>
                </div>
                <div className="rounded bg-blue-50 p-2">
                  <div className="text-xs font-bold text-blue-700">{stats.planned}</div>
                  <div className="text-[10px] text-blue-700/80">Planifiées</div>
                </div>
                <div className="rounded bg-red-50 p-2">
                  <div className="text-xs font-bold text-red-700">{stats.delayed}</div>
                  <div className="text-[10px] text-red-700/80">Retardées</div>
                </div>
              </div>
              {stats.urgent > 0 && (
                <div className="mt-2 flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700">
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
              <span className="flex items-center gap-1 text-[10px] text-gray-400">
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
                            <span title="Permis arrive à expiration" className="text-[10px] text-amber-600">⚠</span>
                          )}
                        </div>
                        {driver.phone && (
                          <div className="text-[10px] text-gray-500">{driver.phone}</div>
                        )}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor}`}>
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
                            <div key={m.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1 text-[11px]">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-gray-700">{m.label}</div>
                                {m.destination && (
                                  <div className="truncate text-[10px] text-gray-500">→ {m.destination}</div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-gray-600">{dateLabel}</div>
                                {(m.priority === 'Urgente' || m.priority === 'Haute') && (
                                  <div className="text-[10px] font-semibold text-red-600">{m.priority}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {driver.missions.length > 3 && (
                          <div className="text-center text-[10px] text-gray-400">
                            +{driver.missions.length - 3} mission{driver.missions.length - 3 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] text-gray-400 italic">Aucune mission planifiée</div>
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
        if (liveDeliveryMapLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mr-2" />
              Chargement de la carte…
            </div>
          );
        }
        const mapData = liveDeliveryMap ?? { deliveries: [], vehicles: [] };
        if (mapData.deliveries.length === 0 && mapData.vehicles.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Package className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune position renseignée</div>
              <div className="text-xs text-gray-400 mt-1">
                Suivi statut/ETA — position affichée si renseignée (pas de télématique temps réel)
              </div>
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-gray-600">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                  {mapData.vehicles.filter((v) => v.status === 'En mission').length} en mission
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  {mapData.vehicles.filter((v) => v.status === 'Disponible').length} disponibles
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  {mapData.deliveries.length} destinations
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden rounded">
              <DeliveryMap deliveries={mapData.deliveries} vehicles={mapData.vehicles} />
            </div>
          </div>
        );
      }
      if (widget.id === 'container-tracking') {
        if (liveFreightContainersLoading) {
          return (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mr-2" />
              Chargement des conteneurs…
            </div>
          );
        }
        const cont = (liveFreightContainers ?? []).filter((c) => c.lat != null && c.lng != null);
        if (cont.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
              <Ship className="h-10 w-10 text-gray-300 mb-2" />
              <div>Aucune position renseignée</div>
              <div className="text-xs text-gray-400 mt-1">Suivi statut/ETA — ajoutez lat/lng aux conteneurs (pas de télématique temps réel)</div>
            </div>
          );
        }
        const byStatus: Record<string, number> = {};
        (liveFreightContainers ?? []).forEach((c) => {
          byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        });
        return (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-[10px] text-gray-600">
              <span className="flex items-center gap-1">
                <Ship className="h-3 w-3 text-teal-600" />
                {(liveFreightContainers ?? []).length} suivi{(liveFreightContainers ?? []).length > 1 ? 's' : ''}
              </span>
              {Object.entries(byStatus).slice(0, 3).map(([st, n]) => (
                <span key={st} className="rounded bg-gray-100 px-1.5 py-0.5">{st} : {n}</span>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden rounded border border-gray-100">
              <FreightContainerMap containers={cont} />
            </div>
          </div>
        );
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
            <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-[10px] text-gray-600">
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

export default WidgetRenderer; 