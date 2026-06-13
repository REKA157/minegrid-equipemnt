import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Sparkles, Target, Loader2 } from 'lucide-react';
import { RealPipelineService } from '../../../services/realPipelineService';
import { getDashboardStats } from '../../../utils/api/dashboard';
import type { DashboardStats } from '../../../utils/api/types';
import {
  getRentalRevenue,
  getUpcomingRentals,
  getRentalPipelineLeads,
} from '../../../utils/enterpriseApi/rentals';
import { getEquipmentAvailability } from '../../../utils/enterpriseApi/equipment';
import { buildCorrelatedRentalActions } from '../../../utils/buildCorrelatedRentalActions';
import {
  getPreventiveMaintenance,
  getUrgentInterventions,
} from '../../../utils/enterpriseApi/interventions';
import { getRepairsStatus } from '../../../utils/enterpriseApi/repairs';
import { getInventoryStatus } from '../../../utils/enterpriseApi/inventory';
import { getTechniciansWorkload } from '../../../utils/enterpriseApi/technicians';
import {
  getActiveDeliveries,
  getDriversList,
  getVehiclesList,
  getDriverSchedule,
  getTransportCosts,
} from '../../../utils/enterpriseApi/transport';
import {
  getCreditApplications,
  getInsurancePolicies,
  getCommissionTracking,
  getClientPortfolio,
  getPerformanceAnalytics,
} from '../../../utils/enterpriseApi/courtier';
import {
  getPortfolioValue,
  getInvestmentOpportunities,
  getOpportunitiesScore,
  getRiskAssessment,
} from '../../../utils/enterpriseApi/investisseur';
import {
  getWarehouseOccupancyMetrics,
  getRouteTrackingRows,
  getLogisticsStockAlertsList,
  getSupplyChainKpisChart,
} from '../../../utils/enterpriseApi/logisticien';
import {
  getCustomsClearanceMetrics,
  getContainerTrackingRows,
  getFreightDocumentsForList,
} from '../../../utils/enterpriseApi/transitaire';
import { listAccessibleTransactionCases } from '../../../utils/api/transactionCases';
import { getQuoteRequests } from '../../../utils/api/quoteRequests';
import {
  buildVendeurCockpit,
  type CockpitSummaryData,
  type CockpitSignal,
} from './buildVendeurCockpit';
import { buildLoueurCockpit } from './buildLoueurCockpit';
import { buildMecanicienCockpit } from './buildMecanicienCockpit';
import { buildTransporteurCockpit } from './buildTransporteurCockpit';
import { buildCourtierCockpit } from './buildCourtierCockpit';
import { buildInvestisseurCockpit } from './buildInvestisseurCockpit';
import { buildLogisticienCockpit } from './buildLogisticienCockpit';
import { buildTransitaireCockpit } from './buildTransitaireCockpit';
import { buildFinancierCockpit } from './buildFinancierCockpit';
import { buildQuoteSignals } from './correlations/quoteCorrelation';
import { buildDossierStageSignals } from './correlations/caseCorrelation';

const EMPTY_STATS: DashboardStats = {
  totalViews: 0,
  totalMessages: 0,
  totalOffers: 0,
  weeklyViews: 0,
  monthlyViews: 0,
  weeklyGrowth: 0,
  monthlyGrowth: 0,
};

/** Valeur d'un fetch (allSettled) ou fallback si rejet. `any` volontaire : les builders sont défensifs. */
function pick(r: PromiseSettledResult<any>, fb: any): any {
  return r.status === 'fulfilled' ? r.value : fb;
}

// ---------------------------------------------------------------------------
// LOADERS par rôle : fetch des services RÉELS (allSettled tolérant) -> builder pur.
// Définis au niveau module = références stables (pas de re-render inutile).
// ---------------------------------------------------------------------------

async function loadVendeur(): Promise<CockpitSummaryData> {
  const [leads, stats, quotes, cases] = await Promise.allSettled([
    RealPipelineService.getLeads(),
    getDashboardStats(),
    getQuoteRequests('all'),
    listAccessibleTransactionCases(),
  ]);
  const cockpit = buildVendeurCockpit(pick(leads, []), pick(stats, EMPTY_STATS));
  // M1 — devis → action (+ dossier) : signaux cross-module quote_requests × transaction_cases.
  const q = buildQuoteSignals(pick(quotes, []));
  // M2 — dossier transaction → action d'avancement par étape (transaction_cases, RLS).
  const d = buildDossierStageSignals(pick(cases, []));
  cockpit.priorities = [...q.priorities, ...d.priorities, ...cockpit.priorities];
  cockpit.risks = [...d.risks, ...cockpit.risks];
  cockpit.opportunities = [...cockpit.opportunities, ...q.opportunities];
  return cockpit;
}

async function loadLoueur(): Promise<CockpitSummaryData> {
  const [rev, actions, equip, up, pipe] = await Promise.allSettled([
    getRentalRevenue(),
    buildCorrelatedRentalActions(),
    getEquipmentAvailability(),
    getUpcomingRentals(),
    getRentalPipelineLeads(),
  ]);
  const equipmentStats =
    equip.status === 'fulfilled' && equip.value?.stats
      ? equip.value.stats
      : { total: 0, available: 0, rented: 0, maintenance: 0 };
  return buildLoueurCockpit({
    revenue: pick(rev, { revenue: 0, count: 0, growth: 0 }),
    actions: pick(actions, []),
    equipmentStats,
    upcomingRentals: pick(up, []),
    pipelineLeads: pick(pipe, []),
  });
}

async function loadMecanicien(): Promise<CockpitSummaryData> {
  const [interventions, urgent, repairs, inventory, technicians] = await Promise.allSettled([
    getPreventiveMaintenance(),
    getUrgentInterventions(),
    getRepairsStatus(),
    getInventoryStatus(),
    getTechniciansWorkload(),
  ]);
  return buildMecanicienCockpit({
    interventions: pick(interventions, { interventions: [], stats: {} }),
    urgent: pick(urgent, []),
    repairs: pick(repairs, []),
    inventory: pick(inventory, []),
    technicians: pick(technicians, []),
  });
}

async function loadTransporteur(): Promise<CockpitSummaryData> {
  const [deliveries, drivers, vehicles, schedule, costs] = await Promise.allSettled([
    getActiveDeliveries(),
    getDriversList(),
    getVehiclesList(),
    getDriverSchedule(),
    getTransportCosts(),
  ]);
  return buildTransporteurCockpit({
    deliveries: pick(deliveries, { total: 0, rows: [] }),
    drivers: pick(drivers, []),
    vehicles: pick(vehicles, []),
    schedule: pick(schedule, []),
    costs: pick(costs, []),
  });
}

async function loadCourtier(): Promise<CockpitSummaryData> {
  const [credits, policies, commissions, clients] = await Promise.allSettled([
    getCreditApplications(),
    getInsurancePolicies(),
    getCommissionTracking(),
    getClientPortfolio(),
  ]);
  return buildCourtierCockpit({
    credits: pick(credits, []),
    policies: pick(policies, []),
    commissions: pick(commissions, { monthCommission: 0, totalCommission: 0 }),
    clients: pick(clients, []),
  });
}

async function loadInvestisseur(): Promise<CockpitSummaryData> {
  const [portfolio, opportunities, oppScore, risk] = await Promise.allSettled([
    getPortfolioValue(),
    getInvestmentOpportunities(),
    getOpportunitiesScore(),
    getRiskAssessment(),
  ]);
  return buildInvestisseurCockpit({
    portfolio: pick(portfolio, {}),
    opportunities: pick(opportunities, []),
    oppScore: pick(oppScore, {}),
    risk: pick(risk, {}),
  });
}

async function loadLogisticien(): Promise<CockpitSummaryData> {
  const [warehouses, routes, alerts, kpis, cases] = await Promise.allSettled([
    getWarehouseOccupancyMetrics(),
    getRouteTrackingRows(),
    getLogisticsStockAlertsList(),
    getSupplyChainKpisChart(),
    listAccessibleTransactionCases(),
  ]);
  return buildLogisticienCockpit({
    warehouses: pick(warehouses, {}),
    routes: pick(routes, []),
    alerts: pick(alerts, []),
    kpis: pick(kpis, {}),
    cases: pick(cases, []),
  });
}

async function loadTransitaire(): Promise<CockpitSummaryData> {
  const [customs, containers, documents] = await Promise.allSettled([
    getCustomsClearanceMetrics(),
    getContainerTrackingRows(),
    getFreightDocumentsForList(),
  ]);
  return buildTransitaireCockpit({
    customs: pick(customs, {}),
    containers: pick(containers, []),
    documents: pick(documents, []),
  });
}

async function loadFinancier(): Promise<CockpitSummaryData> {
  const [rentalRevenue, upcomingRentals, pipeline, commissions, credits, policies, clients, performance, cases] =
    await Promise.allSettled([
      getRentalRevenue(),
      getUpcomingRentals(),
      getRentalPipelineLeads(),
      getCommissionTracking(),
      getCreditApplications(),
      getInsurancePolicies(),
      getClientPortfolio(),
      getPerformanceAnalytics(),
      listAccessibleTransactionCases(),
    ]);
  return buildFinancierCockpit({
    rentalRevenue: pick(rentalRevenue, { revenue: 0, count: 0, growth: 0 }),
    upcomingRentals: pick(upcomingRentals, []),
    pipeline: pick(pipeline, []),
    commissions: pick(commissions, { monthCommission: 0, totalCommission: 0 }),
    credits: pick(credits, []),
    policies: pick(policies, []),
    clients: pick(clients, []),
    performance: pick(performance, []),
    cases: pick(cases, []),
  });
}

const LOADERS: Record<string, () => Promise<CockpitSummaryData>> = {
  vendeur: loadVendeur,
  loueur: loadLoueur,
  mecanicien: loadMecanicien,
  transporteur: loadTransporteur,
  courtier: loadCourtier,
  investisseur: loadInvestisseur,
  logisticien: loadLogisticien,
  transitaire: loadTransitaire,
  financier: loadFinancier,
};

// ---------------------------------------------------------------------------
// Présentation
// ---------------------------------------------------------------------------

function dotClass(tone: CockpitSignal['tone']): string {
  if (tone === 'urgent') return 'bg-red-500';
  if (tone === 'warn') return 'bg-amber-500';
  if (tone === 'good') return 'bg-emerald-500';
  return 'bg-gray-300';
}

function SignalList({ signals, emptyText }: { signals: CockpitSignal[]; emptyText: string }) {
  if (!signals.length) return <p className="text-xs text-gray-400">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {signals.map((s) => {
        const body = (
          <div className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(s.tone)}`} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-gray-800">{s.label}</span>
              {s.detail && <span className="block truncate text-[11px] text-gray-500">{s.detail}</span>}
            </span>
          </div>
        );
        return (
          <li key={s.id}>
            {s.href ? (
              <a href={s.href} className="block rounded px-1 py-0.5 transition-colors hover:bg-gray-50">
                {body}
              </a>
            ) : (
              <div className="px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CockpitCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${accent}`}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/** Vue partagée du cockpit (4 cartes décisionnelles). */
function CockpitView({ data }: { data: CockpitSummaryData }) {
  const revenue = new Intl.NumberFormat('fr-FR').format(Math.round(data.revenueValue));
  const headlineAvailable = data.revenueAvailable !== false;
  const unit = data.revenueUnit ?? 'MAD';
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">Aujourd'hui</h2>
        <span className="text-[11px] text-gray-400">Temps réel · données de votre activité</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <CockpitCard icon={<TrendingUp className="h-3.5 w-3.5" />} title={data.revenueLabel} accent="text-emerald-700">
          {headlineAvailable ? (
            <div className="text-xl font-bold text-gray-900">
              {revenue} <span className="text-sm font-medium text-gray-500">{unit}</span>
            </div>
          ) : (
            <div className="text-xl font-bold text-gray-400">—</div>
          )}
          {data.revenueHint ? <p className="mt-0.5 text-[11px] text-gray-500">{data.revenueHint}</p> : null}
        </CockpitCard>

        <CockpitCard icon={<Target className="h-3.5 w-3.5" />} title="Priorités du jour" accent="text-orange-700">
          <SignalList
            signals={data.priorities}
            emptyText="Aucune action prioritaire détectée."
          />
        </CockpitCard>

        <CockpitCard icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Risques" accent="text-amber-700">
          <SignalList signals={data.risks} emptyText="Aucun risque détecté." />
        </CockpitCard>

        <CockpitCard icon={<Sparkles className="h-3.5 w-3.5" />} title="Opportunités" accent="text-sky-700">
          <SignalList signals={data.opportunities} emptyText="Aucune opportunité chaude pour l'instant." />
        </CockpitCard>
      </div>
    </section>
  );
}

function CockpitLoading() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-6 text-sm text-gray-500">
      <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
      Préparation de votre cockpit…
    </div>
  );
}

function useCockpit(loader: () => Promise<CockpitSummaryData>) {
  const [data, setData] = useState<CockpitSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const d = await loader();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const onRefresh = () => void run();
    window.addEventListener('pipeline:refresh', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('pipeline:refresh', onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [loader]);
  return { data, loading };
}

function RoleCockpit({ loader }: { loader: () => Promise<CockpitSummaryData> }) {
  const { data, loading } = useCockpit(loader);
  if (loading && !data) return <CockpitLoading />;
  if (!data) return null;
  return <CockpitView data={data} />;
}

/**
 * Cockpit décisionnel « Que dois-je faire aujourd'hui ? » en tête de dashboard.
 * Implémenté pour les 9 rôles métier (vendeur, loueur, mécanicien, transporteur,
 * courtier, investisseur, logisticien, transitaire, financier), chacun sur ses
 * données RÉELLES. États vides honnêtes (anti-façade) ; rôle inconnu => null.
 */
export default function CockpitSummary({ role }: { role: string }) {
  const loader = LOADERS[role];
  if (!loader) return null;
  return <RoleCockpit loader={loader} />;
}
