import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type { getPreventiveMaintenance, getUrgentInterventions } from '../../../utils/enterpriseApi/interventions';
import type { getRepairsStatus } from '../../../utils/enterpriseApi/repairs';
import type { getInventoryStatus } from '../../../utils/enterpriseApi/inventory';
import type { getTechniciansWorkload } from '../../../utils/enterpriseApi/technicians';

/**
 * Cockpit MÉCANICIEN — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES atelier (enterpriseApi : interventions, repairs,
 * inventory, technicians/tasks) lisibles aujourd'hui via supabaseCall + fallback.
 * Fonction PURE et testable (`now` injectable) : aucun appel réseau/supabase,
 * aucune lecture globale ; elle ne fait que transformer `input` en cartes.
 * Aucune valeur inventée — états vides honnêtes quand il n'y a pas de donnée.
 *
 * CARTES ÉCARTÉES (availableToday=false dans le spec, NON implémentées ici) —
 * tout le pont cross-module inspection -> escrow, dépendant des tables
 * transaction_platform (inspection_requests/reports, payment_records) qui sont
 * schema-only (readTable intercepte PGRST205 -> []) donc non lisibles aujourd'hui :
 *   - prio-case-inspection-due  (dossier transaction : inspection attendue avant paiement)
 *   - risk-inspection-blocks-payment  (dossier en phase paiement bloqué par inspection)
 *   - opp-inspection-mandate  (nouveau mandat d'inspection — revenu mécanicien)
 * À implémenter dès que ces tables sont déployées + peuplées (assigned_to = mécanicien).
 */

type PreventiveMaintenance = Awaited<ReturnType<typeof getPreventiveMaintenance>>;
type UrgentInterventions = Awaited<ReturnType<typeof getUrgentInterventions>>;
type RepairsStatus = Awaited<ReturnType<typeof getRepairsStatus>>;
type InventoryStatus = Awaited<ReturnType<typeof getInventoryStatus>>;
type TechniciansWorkload = Awaited<ReturnType<typeof getTechniciansWorkload>>;

export interface MecanicienCockpitInput {
  /** getPreventiveMaintenance() — { interventions, stats: { overdue, thisWeek, ... } } */
  interventions: PreventiveMaintenance;
  /** getUrgentInterventions() — interventions priorité Urgente non terminées */
  urgent: UrgentInterventions;
  /** getRepairsStatus() — réparations en cours non terminées */
  repairs: RepairsStatus;
  /** getInventoryStatus() — stock pièces détachées (needs_restock) */
  inventory: InventoryStatus;
  /** getTechniciansWorkload() — charge par technicien (workload_percentage, status) */
  technicians: TechniciansWorkload;
}

export function buildMecanicienCockpit(
  input: MecanicienCockpitInput,
  _now: number = Date.now(),
): CockpitSummaryData {
  const stats = input.interventions?.stats;
  const overdueCount = stats?.overdue ?? 0;
  const thisWeekCount = stats?.thisWeek ?? 0;
  const enriched = input.interventions?.interventions ?? [];

  const urgent = input.urgent ?? [];
  const urgentCount = urgent.length;

  const repairs = input.repairs ?? [];
  const repairsOpenCount = repairs.length;

  const inventory = input.inventory ?? [];
  const restockItems = inventory.filter((i) => i.needs_restock);
  const restockCount = restockItems.length;

  const technicians = input.technicians ?? [];
  const overloaded = technicians.filter((t) => (t.workload_percentage ?? 0) >= 90);
  const available = technicians.filter(
    (t) => (t.workload_percentage ?? 0) < 60 && t.status === 'disponible',
  );

  // Interventions à venir cette semaine sans technicien assigné.
  const unassignedThisWeek = enriched.filter(
    (i) => i.technicianName === 'Non assigné' && i.isThisWeek,
  );

  // ============ HEADLINE ============
  // Métrique décisionnelle réelle : retards + urgentes à traiter avant tout.
  const headlineValue = overdueCount + urgentCount;

  // ============ PRIORITÉS ============
  const priorities: CockpitSignal[] = [];
  if (overdueCount > 0) {
    priorities.push({
      id: 'prio-overdue-interventions',
      label: `${overdueCount} interventions en retard (échéance dépassée, non terminées)`,
      detail: 'Réassigner un technicien ou passer le statut à « En cours ».',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }
  if (urgentCount > 0) {
    priorities.push({
      id: 'prio-urgent-interventions',
      label: `${urgentCount} interventions priorité Urgente non terminées`,
      detail: "Vérifier l'assignation technicien, lancer l'exécution.",
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }
  if (repairsOpenCount > 0) {
    priorities.push({
      id: 'prio-repairs-blocked',
      label: `${repairsOpenCount} réparations en cours non terminées`,
      detail: 'Assigner/changer le technicien ou clôturer la réparation.',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ============ RISQUES ============
  const risks: CockpitSignal[] = [];
  if (restockCount > 0) {
    risks.push({
      id: 'risk-stock-rupture',
      label: `${restockCount} pièces sous le seuil minimum (rupture imminente)`,
      detail: 'Passer une commande de réappro au fournisseur indiqué.',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }
  if (overloaded.length > 0) {
    risks.push({
      id: 'risk-technician-overload',
      label: `${overloaded.length} technicien(s) en surcharge (>90% de la charge max)`,
      detail: "Rééquilibrer vers un technicien disponible.",
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }
  if (unassignedThisWeek.length > 0) {
    risks.push({
      id: 'risk-unassigned-interventions',
      label: `${unassignedThisWeek.length} interventions à venir sans technicien assigné`,
      detail: 'Assigner un technicien en croisant avec la charge des techs.',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ============ OPPORTUNITÉS ============
  const opportunities: CockpitSignal[] = [];
  if (thisWeekCount > 0) {
    opportunities.push({
      id: 'opp-preventive-this-week',
      label: `${thisWeekCount} maintenances préventives planifiées cette semaine`,
      detail: 'Préparer les pièces (vérifier stock) et confirmer les assignations.',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }
  if (restockCount >= 2) {
    opportunities.push({
      id: 'opp-restock-batch',
      label: 'Regrouper le réappro pièces par fournisseur',
      detail: `${restockCount} pièces en alerte — commande groupée par supplier.`,
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }
  if (available.length > 0) {
    opportunities.push({
      id: 'opp-available-technicians',
      label: `${available.length} technicien(s) disponibles avec capacité libre`,
      detail: 'Affecter les interventions en retard ou non assignées.',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  return {
    revenueLabel: 'À traiter aujourd’hui',
    revenueValue: headlineValue,
    revenueHint: `${overdueCount} en retard · ${urgentCount} urgentes`,
    revenueUnit: 'interventions',
    revenueAvailable: true,
    priorities,
    risks,
    opportunities,
  };
}
