import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type {
  getWarehouseOccupancyMetrics,
  getRouteTrackingRows,
  getLogisticsStockAlertsList,
  getSupplyChainKpisChart,
} from '../../../utils/enterpriseApi/logisticien';
import type { listAccessibleTransactionCases } from '../../../utils/api/transactionCases';

/**
 * Cockpit LOGISTICIEN — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES, lues via les services enterpriseApi du rôle :
 *  - entrepôts  : getWarehouseOccupancyMetrics (logistics_warehouses, RLS created_by)
 *  - routes     : getRouteTrackingRows         (logistics_route_tracking)
 *  - alertes    : getLogisticsStockAlertsList   (logistics_stock_alerts, déjà filtré Ouvert/En traitement)
 *  - kpis       : getSupplyChainKpisChart       (logistics_scm_kpis_monthly)
 *  - dossiers   : listAccessibleTransactionCases (transaction_cases)
 *
 * Fonction PURE et testable (`now` injectable) : aucune lecture réseau/supabase,
 * aucune lecture globale — elle ne fait que transformer `input` en cartes.
 * Aucune valeur inventée : chaque carte n'est poussée que si sa condition réelle
 * est vraie (états vides honnêtes, anti-façade).
 *
 * CARTES SPÉCIFIÉES MAIS ÉCARTÉES (availableToday=false dans le spec) — NON implémentées :
 *  - risk  rupture_bloque_dossier        : rapprochement manuel alerte<->dossier, pas de clé de jointure exploitable.
 *  - risk  transport_request_bloque      : transaction_platform.transportRequestService — table sans seed (retour vide).
 *  - risk  customs_missing_docs          : transaction_platform.customsCaseService — table sans seed (retour vide).
 *  - opp   route_pour_dossier_livraison  : rapprochement manuel route<->dossier, pas de fonction de jointure TS.
 *  (cf. NOTES du spec, lignes 345-360 : logistics_tasks / transport_requests / customs_cases non seedées.)
 */

type WarehouseMetrics = Awaited<ReturnType<typeof getWarehouseOccupancyMetrics>>;
type RouteRows = Awaited<ReturnType<typeof getRouteTrackingRows>>;
type StockAlerts = Awaited<ReturnType<typeof getLogisticsStockAlertsList>>;
type ScmKpis = Awaited<ReturnType<typeof getSupplyChainKpisChart>>;
type TransactionCases = Awaited<ReturnType<typeof listAccessibleTransactionCases>>;

export interface LogisticienCockpitInput {
  warehouses: WarehouseMetrics;
  routes: RouteRows;
  alerts: StockAlerts;
  kpis: ScmKpis;
  cases: TransactionCases;
}

/** ETA dépassée par rapport à `now` (string ISO). */
function isOverdue(eta: string | null | undefined, now: number): boolean {
  if (!eta) return false;
  const t = new Date(eta).getTime();
  if (Number.isNaN(t)) return false;
  return t < now;
}

/**
 * Le type d'alerte (`alert_type`) n'est pas exposé en champ structuré sur ListItem :
 * il est préfixé dans `description` ("Excedent — stock …", "Rupture — …"). On lit donc
 * le token de tête avant le tiret pour reclasser l'alerte sans inventer de donnée.
 */
function alertType(description: string | undefined): string {
  if (!description) return '';
  const head = description.split('—')[0];
  return (head || '').trim();
}

const LOGISTICS_CASE_STATUSES = ['logistics', 'customs', 'delivery'];

export function buildLogisticienCockpit(
  input: LogisticienCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { warehouses, routes, alerts, kpis, cases } = input;

  // ---- PRIORITÉS DU JOUR ----
  const priorities: CockpitSignal[] = [];

  // stock_alerts_urgent — alertes stock ouvertes à traiter (dont rupture/Urgent).
  // (getLogisticsStockAlertsList renvoie déjà uniquement Ouvert/En traitement.)
  if (alerts.length > 0) {
    const urgent = alerts.filter((a) => a.priority === 'high').length;
    priorities.push({
      id: 'pri:stock-alerts',
      label: `${alerts.length} alerte(s) stock à traiter${urgent > 0 ? ` (dont ${urgent} urgente(s))` : ''}`,
      detail: 'Déclencher le réappro (commande fournisseur) ou un transfert inter-entrepôt, puis mettre à jour le statut.',
      href: '#dashboard-entreprise/logisticien?tab=alertes',
      tone: urgent > 0 ? 'urgent' : 'warn',
    });
  }

  // routes_retard — routes en retard / à re-router maintenant.
  const delayedRoutes = routes.filter((r) => r.status === 'Retard' || isOverdue(r.eta, now));
  if (delayedRoutes.length > 0) {
    priorities.push({
      id: 'pri:routes-retard',
      label: `${delayedRoutes.length} route(s) en retard / à re-router maintenant`,
      detail: 'Contacter le chauffeur/transporteur, recalculer l\'ETA ou ré-affecter le véhicule ; mettre à jour le statut.',
      href: '#dashboard-entreprise/logisticien?tab=routes',
      tone: 'warn',
    });
  }

  // warehouse_desaturer — entrepôt à désaturer (occupation >= 92% ou Surchargé / Maintenance / Fermé).
  if (warehouses.criticalWarehouses > 0 || warehouses.maintenanceWarehouses > 0) {
    const crit = warehouses.criticalWarehouses;
    const maint = warehouses.maintenanceWarehouses;
    const parts: string[] = [];
    if (crit > 0) parts.push(`${crit} critique(s)`);
    if (maint > 0) parts.push(`${maint} en maintenance/fermé`);
    priorities.push({
      id: 'pri:warehouse-desaturer',
      label: `Entrepôt(s) à désaturer : ${parts.join(' · ')}`,
      detail: 'Planifier un transfert de palettes vers un hub à faible occupation ou bloquer les entrées ; réorienter les flux des hubs en Maintenance/Fermé.',
      href: '#dashboard-entreprise/logisticien?tab=entrepots',
      tone: 'warn',
    });
  }

  // dossiers_logistique_a_coordonner — dossiers en phase logistique/douane/livraison.
  const logisticsCases = cases.filter((c) => LOGISTICS_CASE_STATUSES.includes(c.status));
  if (logisticsCases.length > 0) {
    priorities.push({
      id: 'pri:dossiers-logistique',
      label: `${logisticsCases.length} dossier(s) en phase logistique/livraison/douane`,
      detail: 'Coordonner l\'acheminement (planifier enlèvement/transport, vérifier l\'étape suivante) et faire avancer le statut du dossier.',
      href: '#dossiers?status=logistics',
      tone: 'neutral',
    });
  }

  // ---- RISQUES ----
  const risks: CockpitSignal[] = [];

  // scm_ontime_degrade — performance livraisons à temps en baisse OU incidents récents.
  if (kpis.onTimeDelta < 0 || kpis.latestIncidents > 0) {
    const bits: string[] = [];
    if (kpis.onTimeDelta < 0) bits.push(`livraisons à temps ${kpis.onTimeDelta}% vs mois dernier`);
    if (kpis.latestIncidents > 0) bits.push(`${kpis.latestIncidents} incident(s) récent(s)`);
    risks.push({
      id: 'risk:scm-ontime',
      label: 'Performance livraisons à temps en baisse',
      detail: bits.join(' · '),
      href: '#dashboard-entreprise/logisticien?tab=kpis',
      tone: 'warn',
    });
  }

  // ---- OPPORTUNITÉS ----
  const opportunities: CockpitSignal[] = [];

  // excedent_a_rapatrier — excédent réutilisable croisé avec une rupture/seuil bas ailleurs.
  const surplusAlerts = alerts.filter((a) => alertType(a.description) === 'Excédent' || alertType(a.description) === 'Excedent');
  const shortageAlerts = alerts.filter((a) => {
    const t = alertType(a.description);
    return t === 'Rupture' || t === 'Seuil bas';
  });
  if (surplusAlerts.length > 0 && shortageAlerts.length > 0) {
    opportunities.push({
      id: 'opp:excedent-rapatrier',
      label: `${surplusAlerts.length} excédent(s) à rapatrier vers ${shortageAlerts.length} rupture(s)/seuil(s) bas`,
      detail: 'Croiser l\'alerte Excédent avec une rupture/seuil bas d\'un autre entrepôt et planifier un transfert interne (économie d\'achat).',
      href: '#dashboard-entreprise/logisticien?tab=alertes',
      tone: 'good',
    });
  }

  // capacite_dispo_consolidation — capacité disponible à remplir pendant qu'un hub sature.
  const freePallets = warehouses.totalCapacityPallets - warehouses.totalUsedPallets;
  if (freePallets > 0 && warehouses.criticalWarehouses > 0) {
    opportunities.push({
      id: 'opp:capacite-dispo',
      label: `${freePallets} palette(s) de capacité disponible à remplir`,
      detail: 'Rediriger les flux entrants ou un transfert depuis un hub saturé vers l\'entrepôt le moins occupé ; améliore le fill_rate.',
      href: '#dashboard-entreprise/logisticien?tab=entrepots',
      tone: 'good',
    });
  }

  // route_planifiee_a_consolider — routes Planifié à fusionner avant départ.
  const plannedRoutes = routes.filter((r) => r.status === 'Planifié');
  if (plannedRoutes.length >= 2) {
    opportunities.push({
      id: 'opp:routes-consolider',
      label: `${plannedRoutes.length} routes planifiées à optimiser/consolider avant départ`,
      detail: 'Comparer les routes Planifié par destination/zone et fusionner les chargements compatibles (meilleur fill_rate, coût/km plus bas).',
      href: '#dashboard-entreprise/logisticien?tab=routes',
      tone: 'good',
    });
  }

  // ---- HEADLINE [%] : taux d'occupation pondéré + entrepôts critiques ----
  return {
    revenueLabel: 'Taux d\'occupation pondéré du réseau',
    revenueValue: warehouses.weightedOccupancyPct,
    revenueUnit: '%',
    revenueHint:
      warehouses.warehouseCount > 0
        ? `${warehouses.warehouseCount} entrepôt(s) · ${warehouses.criticalWarehouses} critique(s) à désaturer`
        : 'Aucun entrepôt enregistré',
    revenueAvailable: true,
    priorities,
    risks,
    opportunities,
  };
}
