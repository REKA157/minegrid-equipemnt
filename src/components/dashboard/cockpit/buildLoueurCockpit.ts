import type { CorrelatedDailyAction } from '../../../utils/correlateLeadActions';
import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';

export interface RentalRevenue {
  revenue: number;
  count: number;
  growth: number;
}

export interface EquipStats {
  total: number;
  available: number;
  rented: number;
  maintenance: number;
}

export interface UpcomingRentalLite {
  id: string;
  end_date?: string;
  daysUntilStart?: number;
}

export interface LoueurCockpitInput {
  revenue: RentalRevenue;
  actions: CorrelatedDailyAction[];
  equipmentStats: EquipStats;
  upcomingRentals: UpcomingRentalLite[];
  pipelineLeads: Array<{ id: string }>;
}

function daysUntil(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

/**
 * Cockpit LOUEUR — « Que dois-je faire aujourd'hui ? ».
 * 100 % données RÉELLES (table `rentals` + parc `machines`/`interventions`),
 * via les services enterpriseApi déjà existants. Fonction PURE et testable.
 */
export function buildLoueurCockpit(
  input: LoueurCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { revenue, actions, equipmentStats, upcomingRentals, pipelineLeads } = input;

  // PRIORITÉS : on réutilise les actions corrélées loueur (déjà priorisées, réelles).
  const priorities: CockpitSignal[] = actions.slice(0, 4).map((a) => ({
    id: a.id,
    label: a.title,
    detail: a.description,
    href: '#dashboard-entreprise',
    tone: a.priority === 'high' ? 'urgent' : 'neutral',
  }));

  const risks: CockpitSignal[] = [];
  if (equipmentStats.maintenance > 0) {
    risks.push({
      id: 'risk:maintenance',
      label: `${equipmentStats.maintenance} équipement(s) en maintenance`,
      detail: 'Indisponible(s) à la location — suivre le retour au parc',
      tone: 'warn',
    });
  }
  const returningSoon = upcomingRentals.filter((r) => {
    const d = daysUntil(r.end_date, now);
    return d !== null && d >= 0 && d <= 3;
  });
  if (returningSoon.length) {
    risks.push({
      id: 'risk:returns',
      label: `${returningSoon.length} retour(s) sous 3 j à préparer`,
      detail: 'Anticiper inspection et remise en location',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }
  if (revenue.growth < 0) {
    risks.push({
      id: 'risk:revenue',
      label: `Revenus en baisse (${revenue.growth}% vs mois dernier)`,
      detail: 'Vérifier le taux d\'occupation du parc',
      tone: 'warn',
    });
  }

  const opportunities: CockpitSignal[] = [];
  if (pipelineLeads.length) {
    opportunities.push({
      id: 'opp:pipeline',
      label: `${pipelineLeads.length} location(s) en pipeline`,
      detail: 'Confirmer les réservations en cours',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }
  if (equipmentStats.available > 0) {
    opportunities.push({
      id: 'opp:idle',
      label: `${equipmentStats.available} équipement(s) disponible(s) à placer`,
      detail: 'Capacité de location inexploitée',
      tone: 'good',
    });
  }
  if (revenue.growth > 0) {
    opportunities.push({
      id: 'opp:growth',
      label: `Revenus en hausse (+${revenue.growth}% ce mois)`,
      detail: 'Dynamique positive à entretenir',
      tone: 'good',
    });
  }

  return {
    revenueLabel: 'Revenus location (ce mois)',
    revenueValue: revenue.revenue,
    revenueHint: `${revenue.count} location(s) · ${revenue.growth >= 0 ? '+' : ''}${revenue.growth}% vs mois dernier`,
    priorities,
    risks,
    opportunities,
  };
}
