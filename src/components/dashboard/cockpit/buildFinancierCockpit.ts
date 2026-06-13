import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type {
  getRentalRevenue,
  getUpcomingRentals,
  getRentalPipelineLeads,
} from '../../../utils/enterpriseApi/rentals';
import type {
  getCommissionTracking,
  getCreditApplications,
  getInsurancePolicies,
  getClientPortfolio,
  getPerformanceAnalytics,
} from '../../../utils/enterpriseApi/courtier';
import type { listAccessibleTransactionCases } from '../../../utils/api/transactionCases';

/**
 * Cockpit FINANCIER — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES, sur tables effectivement seedées :
 *  - rentals (deploy_rentals_loueur.sql) via getRentalRevenue / getUpcomingRentals / getRentalPipelineLeads
 *  - credit_applications / insurance_policies / broker_clients (deploy_courtier.sql) via
 *    getCommissionTracking / getCreditApplications / getInsurancePolicies / getClientPortfolio /
 *    getPerformanceAnalytics
 *  - transaction_cases (RLS réel) via listAccessibleTransactionCases (COMPTE/STATUT seulement)
 *
 * Fonction PURE et testable (`now` injectable). Aucun appel réseau/supabase, aucune lecture
 * globale : elle ne fait que transformer `input` en cartes. Aucune valeur inventée ; états vides
 * honnêtes quand il n'y a pas de donnée (anti-façade).
 *
 * CARTES ÉCARTÉES (availableToday=false, NON implémentées ici — cf. spec financier) :
 *  - "Paiements/encaissements par dossier transaction" (paymentRecordService/commissionRecordService) :
 *    tables payment_records / commission_records / financing_requests jamais seedées → renvoient [].
 *  - "total_amount / currency du dossier" : colonnes optionnelles et absentes du create table →
 *    aucun montant fiable ; listAccessibleTransactionCases utilisé seulement pour compte/statut.
 *  - getOffers (offers) : périmètre vendeur, table non seedée → hors rôle financier.
 *  - trustService / inspectionService / getMessages : aucune décision trésorerie autonome.
 */
export interface FinancierCockpitInput {
  rentalRevenue: Awaited<ReturnType<typeof getRentalRevenue>>;
  upcomingRentals: Awaited<ReturnType<typeof getUpcomingRentals>>;
  pipeline: Awaited<ReturnType<typeof getRentalPipelineLeads>>;
  commissions: Awaited<ReturnType<typeof getCommissionTracking>>;
  credits: Awaited<ReturnType<typeof getCreditApplications>>;
  policies: Awaited<ReturnType<typeof getInsurancePolicies>>;
  clients: Awaited<ReturnType<typeof getClientPortfolio>>;
  performance: Awaited<ReturnType<typeof getPerformanceAnalytics>>;
  cases: Awaited<ReturnType<typeof listAccessibleTransactionCases>>;
}

const DAY_MS = 86_400_000;

function addDays(now: number, days: number): number {
  return now + days * DAY_MS;
}

function parseDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function buildFinancierCockpit(
  input: FinancierCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const {
    rentalRevenue,
    upcomingRentals,
    pipeline,
    commissions,
    credits,
    policies,
    clients,
    performance,
    cases,
  } = input;

  // ===================================================================
  // HEADLINE [MAD] — Encaissement consolidé du mois : revenus location + commissions courtier.
  // ===================================================================
  const rentalThisMonth = Number(rentalRevenue?.revenue) || 0;
  const commissionThisMonth = Number(commissions?.monthCommission) || 0;
  const consolidated = rentalThisMonth + commissionThisMonth;
  const growth = Number(rentalRevenue?.growth) || 0;
  const growthLabel =
    growth > 0 ? `location +${growth}%` : growth < 0 ? `location ${growth}%` : 'location stable';

  // ===================================================================
  // PRIORITÉS DU JOUR
  // ===================================================================
  const priorities: CockpitSignal[] = [];

  // [avail=true] credit-approuve-non-decaisse :: Crédits approuvés en attente de décaissement.
  const approvedNotDisbursed = credits.filter(
    (c) => c.status === 'Approuvé' && !c.disbursement_date,
  );
  if (approvedNotDisbursed.length > 0) {
    priorities.push({
      id: 'fin:credit-approuve-non-decaisse',
      label: `${approvedNotDisbursed.length} crédit(s) approuvé(s) en attente de décaissement (commission non encaissée)`,
      detail: 'Relancer la banque puis passer en « Décaissé » pour encaisser la commission',
      href: '#credit-applications',
      tone: 'urgent',
    });
  }

  // [avail=true] locations-encaissement-imminent :: Locations démarrant sous 7 jours.
  const imminentRentals = upcomingRentals.filter(
    (r) => r.priority === 'urgent' || r.priority === 'high',
  );
  if (imminentRentals.length > 0) {
    priorities.push({
      id: 'fin:locations-encaissement-imminent',
      label: `${imminentRentals.length} location(s) démarrant sous 7 jours : encaissement à sécuriser`,
      detail: 'Vérifier le paiement client avant mise à disposition ; sinon bloquer le statut',
      href: '#rentals',
      tone: 'warn',
    });
  }

  // [avail=true] dossiers-etape-paiement :: Dossiers transaction bloqués à l'étape paiement.
  const paymentCases = cases.filter((c) => c.status === 'payment');
  if (paymentCases.length > 0) {
    priorities.push({
      id: 'fin:dossiers-etape-paiement',
      label: `${paymentCases.length} dossier(s) transaction bloqué(s) à l'étape paiement où j'interviens`,
      detail: 'Identifier qui doit payer (participants/events) et relancer pour débloquer',
      href: '#dossiers',
      tone: 'urgent',
    });
  }

  // ===================================================================
  // RISQUES
  // ===================================================================
  const risks: CockpitSignal[] = [];

  // [avail=true] polices-expirant-impaye :: Polices expirant à 30 jours (commission récurrente à risque).
  const limit30 = addDays(now, 30);
  const expiringPolicies = policies.filter((p) => {
    if (!(p.status === 'Active' || p.status === 'En cours')) return false;
    const end = parseDate(p.end_date);
    return end !== null && end < limit30;
  });
  if (expiringPolicies.length > 0) {
    risks.push({
      id: 'fin:polices-expirant-impaye',
      label: `${expiringPolicies.length} police(s) d'assurance expirant à 30 jours : commission récurrente à risque`,
      detail: 'Contacter le client pour renouvellement (renewInsurancePolicy) et sécuriser la commission',
      href: '#insurance-policies',
      tone: 'warn',
    });
  }

  // [avail=true] concentration-encaissement-client :: Concentration du chiffre sur un seul client.
  const clientsWithVolume = clients.filter((c) => Number(c.totalCreditVolume) > 0);
  if (clientsWithVolume.length >= 1) {
    const totalVolume = clientsWithVolume.reduce(
      (s, c) => s + Number(c.totalCreditVolume || 0),
      0,
    );
    const top = clientsWithVolume.reduce((best, c) =>
      Number(c.totalCreditVolume) > Number(best.totalCreditVolume) ? c : best,
    );
    const share = totalVolume > 0 ? Math.round((Number(top.totalCreditVolume) / totalVolume) * 100) : 0;
    risks.push({
      id: 'fin:concentration-encaissement-client',
      label: `Concentration du chiffre sur un seul client (risque de contrepartie)`,
      detail: `${top.name} = ${share}% du volume crédit — diversifier / exiger des garanties au-delà de 40%`,
      href: '#client-portfolio',
      tone: 'neutral',
    });
  }

  // [avail=true] credits-decision-en-retard :: Crédits dont la décision attendue est dépassée.
  const overdueDecisions = credits.filter((c) => {
    if (c.status !== 'En cours') return false;
    const expected = parseDate(c.expected_decision_date);
    return expected !== null && expected < now;
  });
  if (overdueDecisions.length > 0) {
    risks.push({
      id: 'fin:credits-decision-en-retard',
      label: `${overdueDecisions.length} demande(s) de crédit dont la décision attendue est dépassée`,
      detail: 'Relancer la banque et mettre à jour le statut (Approuvé/Refusé) pour débloquer ou archiver',
      href: '#credit-applications',
      tone: 'warn',
    });
  }

  // ===================================================================
  // OPPORTUNITÉS
  // ===================================================================
  const opportunities: CockpitSignal[] = [];

  // [avail=true] tendance-commissions-6mois :: Tendance des commissions sur 6 mois (crédit vs assurance).
  const hasTrend = performance.some((b) => Number(b.total) > 0);
  if (hasTrend) {
    const credit6m = performance.reduce((s, b) => s + Number(b.credit || 0), 0);
    const assurance6m = performance.reduce((s, b) => s + Number(b.assurance || 0), 0);
    const leadingChannel = credit6m >= assurance6m ? 'crédit' : 'assurance';
    opportunities.push({
      id: 'fin:tendance-commissions-6mois',
      label: 'Tendance des commissions sur 6 mois (crédit vs assurance)',
      detail: `Canal dominant : ${leadingChannel} — réallouer l'effort de prospection vers la courbe en croissance`,
      href: '#performance-analytics',
      tone: 'good',
    });
  }

  // [avail=true] pipeline-location-a-convertir :: Pipeline de location à forte valeur à convertir.
  const negotiationLeads = pipeline.filter((l) => l.stage === 'Négociation' && Number(l.value) > 0);
  if (negotiationLeads.length > 0) {
    const pipelineValue = negotiationLeads.reduce((s, l) => s + Number(l.value || 0), 0);
    opportunities.push({
      id: 'fin:pipeline-location-a-convertir',
      label: `${negotiationLeads.length} location(s) en négociation à forte valeur à convertir en encaissement`,
      detail: `${pipelineValue.toLocaleString('fr-FR')} MAD en jeu — prioriser la relance et faire avancer le statut`,
      href: '#rentals',
      tone: 'good',
    });
  }

  // [avail=true] prospects-portefeuille-a-activer :: Prospects du portefeuille sans dossier ouvert.
  const dormantProspects = clients.filter(
    (c) => c.activeCredits === 0 && c.activePolicies === 0,
  );
  if (dormantProspects.length > 0) {
    opportunities.push({
      id: 'fin:prospects-portefeuille-a-activer',
      label: `${dormantProspects.length} prospect(s) du portefeuille sans dossier ouvert (revenu dormant)`,
      detail: 'Les contacter (phone/email) et ouvrir un crédit ou une police',
      href: '#client-portfolio',
      tone: 'good',
    });
  }

  return {
    revenueLabel: 'Encaissement consolidé du mois (location + commissions)',
    revenueValue: consolidated,
    revenueHint: `${rentalThisMonth.toLocaleString('fr-FR')} location + ${commissionThisMonth.toLocaleString('fr-FR')} commissions · ${growthLabel}`,
    revenueUnit: 'MAD',
    revenueAvailable: true,
    priorities,
    risks,
    opportunities,
  };
}
