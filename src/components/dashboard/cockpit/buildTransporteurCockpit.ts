import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type {
  getActiveDeliveries,
  getDriversList,
  getVehiclesList,
  getDriverSchedule,
  getTransportCosts,
} from '../../../utils/enterpriseApi/transport';

/**
 * Cockpit TRANSPORTEUR — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES issues du schéma logistique interne BRANCHÉ
 * (tables deliveries / drivers / vehicles, via enterpriseApi/transport.ts).
 * Fonction PURE et testable (`now` injectable) : elle ne fait que transformer
 * `input` en cartes. Aucun appel réseau / supabase, aucune lecture globale.
 * Aucune valeur inventée : chaque carte n'est poussée que si sa condition réelle
 * est vraie (états vides honnêtes, anti-façade).
 *
 * CARTES NON IMPLÉMENTÉES (spec [avail=false] — données absentes aujourd'hui) :
 *  - opportunities/tx-assigned-transport-requests : enlèvements engins vendus
 *    assignés (transport_requests). Bloqué : pas de listByTransporter() cross-dossier,
 *    table non seedée, widget commenté « PLANIFIÉ (non branché) ».
 *  - opportunities/tx-cases-logistics-stage : dossiers transaction au stade
 *    logistique. Bloqué : aucun dossier réel relié au transporteur (RLS, pas de flux poussé).
 * Ces deux cartes attendent données + une fonction listByTransporter et des dossiers réels.
 */

export interface TransporteurCockpitInput {
  deliveries: Awaited<ReturnType<typeof getActiveDeliveries>>;
  drivers: Awaited<ReturnType<typeof getDriversList>>;
  vehicles: Awaited<ReturnType<typeof getVehiclesList>>;
  schedule: Awaited<ReturnType<typeof getDriverSchedule>>;
  costs: Awaited<ReturnType<typeof getTransportCosts>>;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isToday(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  return dayKey(t) === dayKey(new Date(now));
}

function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function buildTransporteurCockpit(
  input: TransporteurCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { deliveries, drivers, vehicles, schedule, costs } = input;
  const rows = deliveries?.rows ?? [];

  // ---------- HEADLINE : livraisons actives à préparer / suivre ----------
  // total = Planifiée + En cours + Retardée (déjà agrégé par getActiveDeliveries).
  const headlineValue = deliveries?.total ?? 0;
  const hintParts: string[] = [];
  if ((deliveries?.inProgress ?? 0) > 0) hintParts.push(`${deliveries.inProgress} en cours`);
  if ((deliveries?.planned ?? 0) > 0) hintParts.push(`${deliveries.planned} planifiée(s)`);
  if ((deliveries?.delayed ?? 0) > 0) hintParts.push(`${deliveries.delayed} en retard`);
  if ((deliveries?.urgent ?? 0) > 0) hintParts.push(`${deliveries.urgent} urgente(s)`);
  const revenueHint = hintParts.length ? hintParts.join(' · ') : 'Aucune livraison active';

  const priorities: CockpitSignal[] = [];
  const risks: CockpitSignal[] = [];
  const opportunities: CockpitSignal[] = [];

  // =====================================================================
  // PRIORITÉS
  // =====================================================================

  // [avail=true] deliveries-delayed :: {delayed} livraison(s) en retard à débloquer
  const delayed = deliveries?.delayed ?? 0;
  if (delayed > 0) {
    priorities.push({
      id: 'deliveries-delayed',
      label: `${delayed} livraison(s) en retard à débloquer`,
      detail: 'Lire les notes, appeler le client puis mettre à jour le statut',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // [avail=true] deliveries-unassigned :: Livraisons planifiées sans chauffeur/véhicule
  const unassigned = rows.filter(
    (r) => r.status === 'Planifiée' && (!r.driver_id || !r.vehicle_id),
  );
  if (unassigned.length > 0) {
    priorities.push({
      id: 'deliveries-unassigned',
      label: `${unassigned.length} livraison(s) planifiée(s) sans chauffeur/véhicule à affecter`,
      detail: 'Affecter un chauffeur et un véhicule disponibles puis lancer le départ',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // [avail=true] driver-schedule-today :: Départs du jour à préparer ({missions aujourd'hui})
  const todayMissions = (schedule ?? []).reduce(
    (sum, d) => sum + d.missions.filter((m) => isToday(m.pickupDate, now)).length,
    0,
  );
  if (todayMissions > 0) {
    priorities.push({
      id: 'driver-schedule-today',
      label: `Départs du jour à préparer (${todayMissions} mission(s) aujourd'hui)`,
      detail: 'Appeler le chauffeur, vérifier le véhicule, valider l’enlèvement',
      href: '#dashboard-entreprise',
      tone: 'neutral',
    });
  }

  // =====================================================================
  // RISQUES
  // =====================================================================

  // [avail=true] delivery-eta-overdue :: 'En cours' dont l'ETA est dépassée
  const overdue = rows.filter(
    (r) =>
      r.status === 'En cours' &&
      r.expected_delivery_date != null &&
      new Date(r.expected_delivery_date).getTime() < now &&
      !r.actual_delivery_date,
  );
  if (overdue.length > 0) {
    risks.push({
      id: 'delivery-eta-overdue',
      label: `${overdue.length} livraison(s) 'En cours' dont l'ETA est dépassée`,
      detail: 'Confirmer si livré ou requalifier en « Retardée » et prévenir le client',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // [avail=true] driver-license-expiry :: Permis chauffeur expirant / expiré (< 30 j)
  const expiringLicenses = (drivers ?? []).filter((d) => {
    const days = daysUntil(d.license_expiry, now);
    return days != null && days < 30;
  });
  if (expiringLicenses.length > 0) {
    risks.push({
      id: 'driver-license-expiry',
      label: `${expiringLicenses.length} permis chauffeur expirant / expiré (mission à risque)`,
      detail: 'Réaffecter les missions concernées ou déclencher le renouvellement avant le départ',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // [avail=true] vehicle-maintenance-due :: Véhicule en maintenance encore affecté
  const inMaintenance = (vehicles ?? []).filter((v) => v.status === 'Maintenance');
  if (inMaintenance.length > 0) {
    risks.push({
      id: 'vehicle-maintenance-due',
      label: `${inMaintenance.length} véhicule(s) à entretenir (immobilisation à anticiper)`,
      detail: 'Vérifier qu’aucune livraison planifiée n’y est affectée ; replanifier si besoin',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // =====================================================================
  // OPPORTUNITÉS
  // =====================================================================

  // [avail=true] transport-cost-trend :: Tendance coûts de transport (6 mois)
  if ((costs ?? []).some((b) => b.trips > 0)) {
    opportunities.push({
      id: 'transport-cost-trend',
      label: 'Tendance coûts de transport (6 mois) — marges à surveiller',
      detail: 'Comparer coût/km mois courant vs précédent ; revoir l’affectation si hausse',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // [avail=true] fleet-idle-capacity :: Capacité de flotte disponible (chauffeurs + véhicules libres)
  const freeDrivers = (drivers ?? []).filter((d) => d.availability_status === 'Disponible');
  const freeVehicles = (vehicles ?? []).filter((v) => v.status === 'Disponible');
  if (freeDrivers.length > 0 && freeVehicles.length > 0) {
    opportunities.push({
      id: 'fleet-idle-capacity',
      label: `Capacité de flotte disponible (${freeDrivers.length} chauffeur(s) + ${freeVehicles.length} véhicule(s) libres)`,
      detail: 'Affecter la capacité disponible à une livraison planifiée en attente',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  return {
    revenueLabel: 'Livraisons actives',
    revenueValue: headlineValue,
    revenueHint,
    revenueUnit: 'livraisons',
    revenueAvailable: true,
    priorities,
    risks,
    opportunities,
  };
}
