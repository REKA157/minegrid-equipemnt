import type { RealLead } from '../../../services/realPipelineService';
import type { DashboardStats } from '../../../utils/api/types';

export type CockpitTone = 'neutral' | 'good' | 'warn' | 'urgent';

export interface CockpitSignal {
  id: string;
  label: string;
  detail?: string;
  href?: string;
  tone?: CockpitTone;
}

export interface CockpitSummaryData {
  revenueLabel: string;
  /** Montant en MAD (pipeline ouvert). */
  revenueValue: number;
  revenueHint: string;
  priorities: CockpitSignal[];
  risks: CockpitSignal[];
  opportunities: CockpitSignal[];
}

const PRI: Record<string, number> = { high: 3, medium: 2, low: 1 };

function isOpenStage(stage: string): boolean {
  const s = (stage || '').trim();
  return s !== 'Conclu' && s !== 'Perdu';
}

function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((now - t) / 86_400_000);
}

/**
 * Cockpit VENDEUR — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES : leads du pipeline (table `leads` via RealPipelineService)
 * + stats marketplace (`machine_views`/`messages`/`offers` via getDashboardStats).
 * Fonction PURE et testable (`now` injectable). Aucune valeur inventée : tout dérive
 * des entrées ; états vides honnêtes quand il n'y a pas de donnée.
 */
export function buildVendeurCockpit(
  leads: RealLead[],
  stats: DashboardStats,
  now: number = Date.now(),
): CockpitSummaryData {
  const open = leads.filter((l) => isOpenStage(l.stage || ''));
  const pipelineValue = open.reduce(
    (s, l) => s + (typeof l.value === 'number' ? l.value : Number(l.value) || 0),
    0,
  );
  const stale = open.filter((l) => daysSince(l.last_contact, now) >= 7);
  const hot = open.filter((l) => (l.probability ?? 0) >= 70 || l.priority === 'high');

  // PRIORITÉS DU JOUR : leads ouverts, priorité puis ancienneté de contact.
  const priorities: CockpitSignal[] = [...open]
    .sort((a, b) => {
      const dp = (PRI[b.priority] || 0) - (PRI[a.priority] || 0);
      if (dp) return dp;
      return daysSince(b.last_contact, now) - daysSince(a.last_contact, now);
    })
    .slice(0, 4)
    .map((l) => {
      const d = daysSince(l.last_contact, now);
      return {
        id: `lead:${l.id}`,
        label: l.next_action?.trim() || `Relancer — ${l.title || 'prospect'}`,
        detail: `${l.stage}${d >= 5 ? ` · ${d} j sans contact` : ''}`,
        href: '#dashboard-entreprise',
        tone: l.priority === 'high' ? 'urgent' : 'neutral',
      };
    });

  // RISQUES : pertes potentielles dérivées de données réelles.
  const risks: CockpitSignal[] = [];
  if (stale.length) {
    risks.push({
      id: 'risk:stale',
      label: `${stale.length} prospect(s) sans relance depuis 7 j+`,
      detail: 'Risque de perte — relancer en priorité',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }
  if (stats.totalViews >= 50 && stats.totalMessages / Math.max(stats.totalViews, 1) < 0.03) {
    risks.push({
      id: 'risk:conversion',
      label: 'Beaucoup de vues, peu de contacts',
      detail: `${stats.totalViews} vues · ${stats.totalMessages} messages`,
      tone: 'warn',
    });
  }
  if (stats.monthlyGrowth < 0) {
    risks.push({
      id: 'risk:growth',
      label: `Activité en baisse (${stats.monthlyGrowth}% sur 30 j)`,
      detail: 'Vérifier prix et visibilité des annonces',
      tone: 'warn',
    });
  }

  // OPPORTUNITÉS : leviers de revenu dérivés de données réelles.
  const opportunities: CockpitSignal[] = [];
  if (hot.length) {
    opportunities.push({
      id: 'opp:hot',
      label: `${hot.length} prospect(s) chaud(s) à convertir`,
      detail: 'Probabilité élevée — proposer un devis',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }
  if (stats.totalOffers > 0) {
    opportunities.push({
      id: 'opp:offers',
      label: `${stats.totalOffers} offre(s) reçue(s)`,
      detail: 'À traiter rapidement',
      href: '#offres',
      tone: 'good',
    });
  }
  if (stats.weeklyGrowth > 0) {
    opportunities.push({
      id: 'opp:weekly',
      label: `Vues en hausse (+${stats.weeklyGrowth}% cette semaine)`,
      detail: 'Capitaliser sur la dynamique',
      tone: 'good',
    });
  }

  return {
    revenueLabel: 'Pipeline ouvert',
    revenueValue: pipelineValue,
    revenueHint: `${open.length} opportunité(s) active(s)`,
    priorities,
    risks,
    opportunities,
  };
}
