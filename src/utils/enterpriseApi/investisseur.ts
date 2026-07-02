import supabase from '../supabaseClient';
import { supabaseCall } from '../supabaseCall';

// =====================================================
// APIs POUR LES WIDGETS INVESTISSEUR
// =====================================================

export type InvestmentStatus = 'Détenu' | 'En location' | 'En maintenance' | 'En cession' | 'Cédé' | 'Hors service';
export type FinancingType = 'Cash' | 'Crédit' | 'Crédit-bail' | 'LOA' | 'Mixte';
export type ExitStrategy = 'Conserver' | 'Revendre court terme' | 'Revendre moyen terme' | 'Démanteler / Pièces';

export type OpportunityStatus = 'Active' | 'En négociation' | 'Achetée' | 'Refusée' | 'Expirée' | 'Convertie';
export type OpportunityRecommendation = 'Acheter' | 'Étudier' | 'Suivre' | 'Passer' | 'À étudier';
export type OpportunitySource = 'Annonce Minegrid' | 'Marché secondaire' | 'Vente directe' | 'Encan / Enchères' | 'Concessionnaire' | 'Reprise client' | 'Autre';

export type InvestmentRow = {
  id: string;
  reference?: string | null;
  equipment_label: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  serial_number?: string | null;
  acquisition_date?: string | null;
  acquisition_price?: number | null;
  financing_type?: FinancingType | null;
  monthly_financing_cost?: number | null;
  current_market_value?: number | null;
  expected_lifespan_years?: number | null;
  residual_value?: number | null;
  current_revenue_monthly?: number | null;
  total_revenue_to_date?: number | null;
  maintenance_cost_to_date?: number | null;
  location_count?: number | null;
  status: InvestmentStatus;
  exit_strategy?: ExitStrategy | null;
  target_exit_date?: string | null;
  target_exit_price?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type OpportunityRow = {
  id: string;
  reference?: string | null;
  equipment_label: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  source: OpportunitySource;
  source_url?: string | null;
  asking_price?: number | null;
  estimated_market_value?: number | null;
  estimated_acquisition_costs?: number | null;
  expected_monthly_revenue?: number | null;
  expected_monthly_costs?: number | null;
  expected_holding_years?: number | null;
  expected_resale_value?: number | null;
  expected_roi_percent?: number | null;
  payback_months?: number | null;
  risk_score?: number | null;
  risk_factors?: string | null;
  recommendation: OpportunityRecommendation;
  status: OpportunityStatus;
  contact_name?: string | null;
  contact_phone?: string | null;
  expiry_date?: string | null;
  converted_investment_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

const INVESTMENT_COLUMNS = `
  id, reference, equipment_label, category, brand, model, year, serial_number,
  acquisition_date, acquisition_price, financing_type, monthly_financing_cost,
  current_market_value, expected_lifespan_years, residual_value,
  current_revenue_monthly, total_revenue_to_date, maintenance_cost_to_date, location_count,
  status, exit_strategy, target_exit_date, target_exit_price, notes, created_at
`;

const OPPORTUNITY_COLUMNS = `
  id, reference, equipment_label, category, brand, model, year, source, source_url,
  asking_price, estimated_market_value, estimated_acquisition_costs,
  expected_monthly_revenue, expected_monthly_costs, expected_holding_years,
  expected_resale_value, expected_roi_percent, payback_months,
  risk_score, risk_factors, recommendation, status,
  contact_name, contact_phone, expiry_date, converted_investment_id, notes, created_at
`;

// ---------------------------------------------------------------------
// WIDGET 1 : "VALEUR PORTEFEUILLE" (portfolio-value → metric)
// ---------------------------------------------------------------------
export const getPortfolioValue = async () => {
  const investments = await supabaseCall<InvestmentRow[]>(
    () => supabase.from('investments').select(INVESTMENT_COLUMNS),
    { label: 'getPortfolioValue', fallback: [] },
  );

  const active = investments.filter((i) => i.status !== 'Cédé' && i.status !== 'Hors service');
  const totalAcquisition = active.reduce((s, i) => s + Number(i.acquisition_price || 0), 0);
  const totalMarketValue = active.reduce((s, i) => s + Number(i.current_market_value || 0), 0);
  const totalRevenue = investments.reduce((s, i) => s + Number(i.total_revenue_to_date || 0), 0);
  const totalMaintenance = investments.reduce((s, i) => s + Number(i.maintenance_cost_to_date || 0), 0);
  const totalMonthlyRevenue = active.reduce((s, i) => s + Number(i.current_revenue_monthly || 0), 0);
  const totalMonthlyFinancing = active.reduce((s, i) => s + Number(i.monthly_financing_cost || 0), 0);
  const monthlyNet = totalMonthlyRevenue - totalMonthlyFinancing;

  // Plus-value latente : (valeur actuelle - prix acquisition) sur actifs détenus
  const unrealizedGain = totalMarketValue - totalAcquisition;
  const unrealizedGainPercent = totalAcquisition > 0 ? (unrealizedGain / totalAcquisition) * 100 : 0;

  // Plus-value réalisée sur les actifs cédés
  const sold = investments.filter((i) => i.status === 'Cédé');
  const realizedGain = sold.reduce(
    (s, i) => s + (Number(i.target_exit_price || 0) - Number(i.acquisition_price || 0)),
    0,
  );

  return {
    activeCount: active.length,
    totalCount: investments.length,
    soldCount: sold.length,
    totalMarketValue: Math.round(totalMarketValue),
    totalAcquisition: Math.round(totalAcquisition),
    unrealizedGain: Math.round(unrealizedGain),
    unrealizedGainPercent: Math.round(unrealizedGainPercent * 10) / 10,
    realizedGain: Math.round(realizedGain),
    totalRevenue: Math.round(totalRevenue),
    totalMaintenance: Math.round(totalMaintenance),
    monthlyNet: Math.round(monthlyNet),
    totalMonthlyRevenue: Math.round(totalMonthlyRevenue),
    totalMonthlyFinancing: Math.round(totalMonthlyFinancing),
    investments,
  };
};

// ---------------------------------------------------------------------
// WIDGET 2 : "OPPORTUNITÉS D'INVESTISSEMENT" (investment-opportunities → list)
// ---------------------------------------------------------------------
export const getInvestmentOpportunities = async () => {
  return supabaseCall<OpportunityRow[]>(
    () =>
      supabase
        .from('investment_opportunities')
        .select(OPPORTUNITY_COLUMNS)
        .in('status', ['Active', 'En négociation'])
        .order('expected_roi_percent', { ascending: false, nullsFirst: false }),
    { label: 'getInvestmentOpportunities', fallback: [] },
  );
};

export const getAllOpportunities = async () => {
  return supabaseCall<OpportunityRow[]>(
    () =>
      supabase
        .from('investment_opportunities')
        .select(OPPORTUNITY_COLUMNS)
        .order('created_at', { ascending: false }),
    { label: 'getAllOpportunities', fallback: [] },
  );
};

// ---------------------------------------------------------------------
// WIDGET 3 : "ANALYSE ROI" (roi-analysis → chart)
// ROI par investissement, agrégé par catégorie
// ---------------------------------------------------------------------
export const getRoiAnalysis = async () => {
  const investments = await supabaseCall<InvestmentRow[]>(
    () => supabase.from('investments').select(INVESTMENT_COLUMNS),
    { label: 'getRoiAnalysis', fallback: [] },
  );

  // ROI par investissement = (revenus + valeur actuelle - acquisition - maintenance) / acquisition
  const enriched = investments.map((i) => {
    const acq = Number(i.acquisition_price || 0);
    const rev = Number(i.total_revenue_to_date || 0);
    const maint = Number(i.maintenance_cost_to_date || 0);
    const market = Number(i.current_market_value || 0);
    const monthsHeld = i.acquisition_date
      ? Math.max(
          (Date.now() - new Date(i.acquisition_date).getTime()) / (1000 * 3600 * 24 * 30),
          1,
        )
      : 1;
    const totalGain = rev + market - acq - maint;
    const roiTotal = acq > 0 ? (totalGain / acq) * 100 : 0;
    const roiAnnualized = monthsHeld > 0 ? (roiTotal / monthsHeld) * 12 : 0;
    return {
      id: i.id,
      label: i.equipment_label,
      category: i.category || 'Autre',
      acquisition: acq,
      revenue: rev,
      maintenance: maint,
      marketValue: market,
      gain: Math.round(totalGain),
      roiTotal: Math.round(roiTotal * 10) / 10,
      roiAnnualized: Math.round(roiAnnualized * 10) / 10,
      monthsHeld: Math.round(monthsHeld),
    };
  });

  // Agrégation par catégorie pour le chart
  const byCategory = new Map<string, { name: string; revenue: number; cost: number; gain: number; count: number }>();
  for (const inv of enriched) {
    const key = inv.category;
    if (!byCategory.has(key)) {
      byCategory.set(key, { name: key, revenue: 0, cost: 0, gain: 0, count: 0 });
    }
    const bucket = byCategory.get(key)!;
    bucket.revenue += inv.revenue;
    bucket.cost += inv.acquisition + inv.maintenance;
    bucket.gain += inv.gain;
    bucket.count += 1;
  }

  const chartData = Array.from(byCategory.values()).map((b) => ({
    name: b.name,
    label: b.name,
    value: Math.round(b.gain),
    revenue: Math.round(b.revenue),
    cost: Math.round(b.cost),
    gain: Math.round(b.gain),
    count: b.count,
  }));

  // Tri par gain décroissant
  chartData.sort((a, b) => b.gain - a.gain);

  return {
    chartData,
    investments: enriched.sort((a, b) => b.roiAnnualized - a.roiAnnualized),
  };
};

// ---------------------------------------------------------------------
// WIDGET 4 : "ÉVALUATION RISQUES" (risk-assessment → chart)
// Risques agrégés du portefeuille
// ---------------------------------------------------------------------
export const getRiskAssessment = async () => {
  const investments = await supabaseCall<InvestmentRow[]>(
    () => supabase.from('investments').select(INVESTMENT_COLUMNS).neq('status', 'Cédé'),
    { label: 'getRiskAssessment', fallback: [] },
  );

  if (investments.length === 0) {
    return {
      chartData: [],
      concentrations: [],
      ageRiskCount: 0,
      financingDependencyPercent: 0,
      maintenanceBurdenPercent: 0,
      lowOccupancyCount: 0,
      overallRisk: 0,
    };
  }

  // 1. Concentration par catégorie (risque si une catégorie > 40%)
  const totalValue = investments.reduce((s, i) => s + Number(i.current_market_value || 0), 0) || 1;
  const byCategory = new Map<string, number>();
  for (const i of investments) {
    const cat = i.category || 'Autre';
    byCategory.set(cat, (byCategory.get(cat) || 0) + Number(i.current_market_value || 0));
  }
  const concentrations = Array.from(byCategory.entries())
    .map(([cat, v]) => ({ category: cat, value: v, percent: (v / totalValue) * 100 }))
    .sort((a, b) => b.percent - a.percent);
  const maxConcentration = concentrations[0]?.percent || 0;
  const concentrationRisk = Math.min(Math.round(maxConcentration / 10), 10); // 100% concentration = risque 10

  // 2. Vieillissement : actifs > 8 ans
  const currentYear = new Date().getFullYear();
  const ageRiskCount = investments.filter((i) => i.year && currentYear - i.year > 8).length;
  const ageRisk = Math.min(Math.round((ageRiskCount / investments.length) * 10), 10);

  // 3. Dépendance au financement (mensuel financement / revenus mensuels)
  const totalMonthlyRev = investments.reduce((s, i) => s + Number(i.current_revenue_monthly || 0), 0) || 1;
  const totalMonthlyFin = investments.reduce((s, i) => s + Number(i.monthly_financing_cost || 0), 0);
  const financingDependencyPercent = (totalMonthlyFin / totalMonthlyRev) * 100;
  const financingRisk = Math.min(Math.round(financingDependencyPercent / 10), 10);

  // 4. Charge maintenance vs revenus
  const totalRev = investments.reduce((s, i) => s + Number(i.total_revenue_to_date || 0), 0) || 1;
  const totalMaint = investments.reduce((s, i) => s + Number(i.maintenance_cost_to_date || 0), 0);
  const maintenanceBurdenPercent = (totalMaint / totalRev) * 100;
  const maintenanceRisk = Math.min(Math.round(maintenanceBurdenPercent / 5), 10);

  // 5. Sous-occupation (actifs détenus mais pas en location)
  const lowOccupancyCount = investments.filter(
    (i) => i.status === 'Détenu' && Number(i.current_revenue_monthly || 0) === 0,
  ).length;
  const occupancyRisk = Math.min(Math.round((lowOccupancyCount / investments.length) * 10), 10);

  const chartData = [
    { name: 'Concentration', label: 'Concentration sectorielle', value: concentrationRisk, fullMark: 10 },
    { name: 'Vétusté', label: 'Vieillissement parc', value: ageRisk, fullMark: 10 },
    { name: 'Financier', label: 'Dépendance financement', value: financingRisk, fullMark: 10 },
    { name: 'Opérationnel', label: 'Charge maintenance', value: maintenanceRisk, fullMark: 10 },
    { name: 'Occupation', label: 'Sous-occupation', value: occupancyRisk, fullMark: 10 },
  ];

  const overallRisk = Math.round(
    chartData.reduce((s, r) => s + r.value, 0) / chartData.length,
  );

  return {
    chartData,
    concentrations: concentrations.slice(0, 5),
    ageRiskCount,
    financingDependencyPercent: Math.round(financingDependencyPercent),
    maintenanceBurdenPercent: Math.round(maintenanceBurdenPercent),
    lowOccupancyCount,
    overallRisk,
  };
};

// ---------------------------------------------------------------------
// WIDGET 5 : "ANALYSE DES OPPORTUNITÉS" (opportunities → metric)
// ---------------------------------------------------------------------
export const getOpportunitiesScore = async () => {
  const opportunities = await supabaseCall<OpportunityRow[]>(
    () =>
      supabase
        .from('investment_opportunities')
        .select(OPPORTUNITY_COLUMNS),
    { label: 'getOpportunitiesScore', fallback: [] },
  );

  const active = opportunities.filter((o) => o.status === 'Active' || o.status === 'En négociation');
  const totalValue = active.reduce((s, o) => s + Number(o.asking_price || 0), 0);
  const totalRoi = active.length > 0
    ? active.reduce((s, o) => s + Number(o.expected_roi_percent || 0), 0) / active.length
    : 0;

  const now = Date.now();
  const expiringIn7d = active.filter((o) => {
    if (!o.expiry_date) return false;
    const days = (new Date(o.expiry_date).getTime() - now) / (1000 * 3600 * 24);
    return days >= 0 && days <= 7;
  }).length;

  const recommendBuy = active.filter((o) => o.recommendation === 'Acheter').length;
  const recommendStudy = active.filter((o) => o.recommendation === 'Étudier' || o.recommendation === 'À étudier').length;
  const lowRisk = active.filter((o) => Number(o.risk_score || 5) <= 4).length;
  const highRisk = active.filter((o) => Number(o.risk_score || 5) >= 7).length;

  const converted = opportunities.filter((o) => o.status === 'Achetée' || o.status === 'Convertie').length;
  const refused = opportunities.filter((o) => o.status === 'Refusée').length;
  const conversionRate = opportunities.length > 0
    ? Math.round((converted / opportunities.length) * 100)
    : 0;

  return {
    activeCount: active.length,
    totalValue: Math.round(totalValue),
    avgRoi: Math.round(totalRoi * 10) / 10,
    expiringIn7d,
    recommendBuy,
    recommendStudy,
    lowRisk,
    highRisk,
    converted,
    refused,
    conversionRate,
  };
};

// ---------------------------------------------------------------------
// MUTATIONS — INVESTMENTS
// ---------------------------------------------------------------------
export async function createInvestment(payload: {
  equipment_label: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  acquisition_date?: string;
  acquisition_price?: number | null;
  financing_type?: FinancingType;
  monthly_financing_cost?: number | null;
  current_market_value?: number | null;
  current_revenue_monthly?: number | null;
  expected_lifespan_years?: number | null;
  status?: InvestmentStatus;
  exit_strategy?: ExitStrategy;
  notes?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('investments')
        .insert([
          {
            ...payload,
            acquisition_date: payload.acquisition_date || new Date().toISOString().slice(0, 10),
            financing_type: payload.financing_type || 'Cash',
            status: payload.status || 'Détenu',
            exit_strategy: payload.exit_strategy || 'Conserver',
            current_market_value: payload.current_market_value ?? payload.acquisition_price,
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    { label: 'createInvestment', toastOnError: true, toastMessage: 'Impossible de créer l\'investissement' },
  );
}

// ---------------------------------------------------------------------
// MUTATIONS — OPPORTUNITIES
// ---------------------------------------------------------------------
export async function createOpportunity(payload: {
  equipment_label: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  source?: OpportunitySource;
  source_url?: string | null;
  asking_price: number;
  estimated_market_value?: number | null;
  estimated_acquisition_costs?: number | null;
  expected_monthly_revenue?: number | null;
  expected_monthly_costs?: number | null;
  expected_holding_years?: number;
  expected_resale_value?: number | null;
  risk_score?: number;
  risk_factors?: string | null;
  recommendation?: OpportunityRecommendation;
  contact_name?: string | null;
  contact_phone?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  return supabaseCall(
    () =>
      supabase
        .from('investment_opportunities')
        .insert([
          {
            ...payload,
            source: payload.source || 'Marché secondaire',
            recommendation: payload.recommendation || 'À étudier',
            risk_score: payload.risk_score ?? 5,
            expected_holding_years: payload.expected_holding_years ?? 5,
            status: 'Active',
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    { label: 'createOpportunity', toastOnError: true, toastMessage: 'Impossible de créer l\'opportunité' },
  );
}

export async function updateOpportunityStatus(
  id: string,
  status: OpportunityStatus,
  recommendation?: OpportunityRecommendation,
) {
  const patch: Record<string, unknown> = { status };
  if (recommendation) patch.recommendation = recommendation;
  return supabaseCall(
    () =>
      supabase
        .from('investment_opportunities')
        .update(patch)
        .eq('id', id)
        .select()
        .single(),
    { label: 'updateOpportunityStatus', toastOnError: true },
  );
}

/**
 * Convertit une opportunité en investissement réel.
 * Crée l'investissement puis lie l'opportunité.
 */
export async function convertOpportunityToInvestment(opportunityId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Utilisateur non authentifié');

  const opportunity = await supabaseCall<OpportunityRow>(
    () => supabase.from('investment_opportunities').select(OPPORTUNITY_COLUMNS).eq('id', opportunityId).single(),
    { label: 'convertOpportunity.fetch' },
  );

  const investment = await supabaseCall<InvestmentRow>(
    () =>
      supabase
        .from('investments')
        .insert([
          {
            equipment_label: opportunity.equipment_label,
            category: opportunity.category,
            brand: opportunity.brand,
            model: opportunity.model,
            year: opportunity.year,
            acquisition_date: new Date().toISOString().slice(0, 10),
            acquisition_price: opportunity.asking_price,
            current_market_value: opportunity.estimated_market_value || opportunity.asking_price,
            current_revenue_monthly: opportunity.expected_monthly_revenue || 0,
            expected_lifespan_years: Math.round(Number(opportunity.expected_holding_years || 5) + 2),
            status: 'Détenu',
            exit_strategy: 'Conserver',
            notes: `Issue de l'opportunité ${opportunity.reference || opportunityId}. ${opportunity.notes || ''}`.trim(),
            created_by: userData.user.id,
          },
        ])
        .select()
        .single(),
    { label: 'convertOpportunity.createInvestment', toastOnError: true },
  );

  await supabaseCall(
    () =>
      supabase
        .from('investment_opportunities')
        .update({ status: 'Convertie', converted_investment_id: investment.id })
        .eq('id', opportunityId),
    { label: 'convertOpportunity.linkOpportunity' },
  );

  return investment;
}

// ---------------------------------------------------------------------
// HELPERS DE CALCUL
// ---------------------------------------------------------------------
export function computeOpportunityMetrics(input: {
  asking_price: number;
  acquisition_costs?: number;
  expected_monthly_revenue: number;
  expected_monthly_costs?: number;
  expected_holding_years: number;
  expected_resale_value?: number;
}) {
  const totalInvest = (input.asking_price || 0) + (input.acquisition_costs || 0);
  const monthlyNet = (input.expected_monthly_revenue || 0) - (input.expected_monthly_costs || 0);
  const totalRevenue = monthlyNet * input.expected_holding_years * 12;
  const totalGain = totalRevenue + (input.expected_resale_value || 0) - totalInvest;
  const roiAnnual = totalInvest > 0 ? ((totalGain / totalInvest) / input.expected_holding_years) * 100 : 0;
  const payback = monthlyNet > 0 ? Math.ceil(totalInvest / monthlyNet) : null;
  return {
    totalInvest: Math.round(totalInvest),
    monthlyNet: Math.round(monthlyNet),
    totalRevenue: Math.round(totalRevenue),
    totalGain: Math.round(totalGain),
    roiAnnualPercent: Math.round(roiAnnual * 10) / 10,
    paybackMonths: payback,
  };
}

// ---------------------------------------------------------------------
// WIDGET : "RENDEMENT RÉALISÉ VS ATTENDU" (yield-realized-vs-expected → list)
// Pour chaque actif détenu : revenu ATTENDU sur la période de détention
// (loyer cible ou yield annuel) vs revenu RÉELLEMENT encaissé.
// Écart MAD + % ; surligne les actifs SOUS-PERFORMANTS (réalisé < attendu).
// Enjeu argent n°1 : capital immobilisé qui ne rend pas ce qui était budgété.
// ---------------------------------------------------------------------
export type YieldGapItem = {
  id: string;
  label: string;
  reference: string | null;
  category: string | null;
  status: InvestmentStatus;
  monthsHeld: number;
  expectedMonthly: number;
  expectedRevenue: number;
  realizedRevenue: number;
  gap: number;          // réalisé − attendu (négatif = sous-performance)
  gapPercent: number;   // gap / attendu × 100
  underperforming: boolean;
};

export async function getYieldRealizedVsExpected() {
  const investments = await supabaseCall<
    Array<
      InvestmentRow & {
        target_monthly_revenue?: number | null;
        expected_yield_percent?: number | null;
      }
    >
  >(
    () =>
      supabase
        .from('investments')
        .select(
          `${INVESTMENT_COLUMNS}, target_monthly_revenue, expected_yield_percent`,
        ),
    { label: 'getYieldRealizedVsExpected', fallback: [] },
  );

  const MONTH = 1000 * 3600 * 24 * 30;
  const now = Date.now();

  const items: YieldGapItem[] = investments
    .filter((i) => i.status !== 'Cédé' && i.status !== 'Hors service')
    .map((i) => {
      const acq = Number(i.acquisition_price || 0);
      const targetMonthly = Number(i.target_monthly_revenue || 0);
      const yieldPct = Number(i.expected_yield_percent || 0);
      // Base attendue mensuelle : loyer cible sinon yield annuel / 12
      const expectedMonthly =
        targetMonthly > 0
          ? targetMonthly
          : yieldPct > 0 && acq > 0
            ? (acq * yieldPct) / 100 / 12
            : 0;
      if (expectedMonthly <= 0) return null;

      const monthsHeld = i.acquisition_date
        ? Math.max((now - new Date(i.acquisition_date).getTime()) / MONTH, 1)
        : 1;

      const expectedRevenue = Math.round(expectedMonthly * monthsHeld);
      const realizedRevenue = Math.round(Number(i.total_revenue_to_date || 0));
      const gap = realizedRevenue - expectedRevenue;
      const gapPercent = expectedRevenue > 0 ? (gap / expectedRevenue) * 100 : 0;

      return {
        id: String(i.id),
        label: i.equipment_label,
        reference: i.reference ?? null,
        category: i.category ?? null,
        status: i.status,
        monthsHeld: Math.round(monthsHeld),
        expectedMonthly: Math.round(expectedMonthly),
        expectedRevenue,
        realizedRevenue,
        gap,
        gapPercent: Math.round(gapPercent * 10) / 10,
        underperforming: gap < 0,
      };
    })
    .filter((x): x is YieldGapItem => !!x);

  const totalExpected = items.reduce((s, i) => s + i.expectedRevenue, 0);
  const totalRealized = items.reduce((s, i) => s + i.realizedRevenue, 0);
  const totalGap = totalRealized - totalExpected;
  const totalGapPercent =
    totalExpected > 0 ? Math.round((totalGap / totalExpected) * 1000) / 10 : 0;
  const underperformers = items.filter((i) => i.underperforming);
  const shortfall = underperformers.reduce((s, i) => s + i.gap, 0); // somme des écarts négatifs (MAD manqués)

  return {
    // tri : plus gros manque à gagner (gap le plus négatif) en premier
    items: items.sort((a, b) => a.gap - b.gap),
    totalExpected,
    totalRealized,
    totalGap,
    totalGapPercent,
    underperformingCount: underperformers.length,
    shortfall: Math.round(shortfall),
    assetCount: items.length,
  };
}
