import type { CockpitSummaryData, CockpitSignal } from './buildVendeurCockpit';
import type {
  getCreditApplications,
  getInsurancePolicies,
  getCommissionTracking,
  getClientPortfolio,
} from '../../../utils/enterpriseApi/courtier';

/**
 * Cockpit COURTIER — « Que dois-je faire aujourd'hui ? » en moins de 5 s.
 *
 * 100 % données RÉELLES et seedées (sql/deploy_courtier.sql) : 3 tables CRM privées
 * (broker_clients, credit_applications, insurance_policies, RLS created_by=auth.uid()).
 * Le headline décisionnel = combien je gagne en commissions ce mois et d'où
 * (crédit vs assurance) — pilote l'arbitrage d'effort entre les deux lignes de métier.
 *
 * Fonction PURE et testable (`now` injectable). Aucun appel réseau/supabase, aucune
 * lecture globale : transforme seulement `input` en cartes. Aucune donnée inventée ;
 * chaque carte n'apparaît que si sa condition réelle est vraie (états vides honnêtes).
 *
 * Cartes [avail=false] du spec NON implémentées (cross-module réel mais non peuplé —
 * aucun seed pour transaction_cases / financing_requests / commission_records) :
 *   - risk:financing-case-action-required (dossiers où je suis courtier, financement en attente)
 *   - opp:finance-purchase-from-case      (dossier d'achat sans financement monté)
 *   - opp:commission-record-followup      (commissions de dossier dues non encaissées)
 * À activer dès qu'un workflow nomme le courtier participant d'un transaction_case
 * (href passerait alors à '#dossiers' via listAccessibleTransactionCases).
 */
export interface CourtierCockpitInput {
  credits: Awaited<ReturnType<typeof getCreditApplications>>;
  policies: Awaited<ReturnType<typeof getInsurancePolicies>>;
  commissions: Awaited<ReturnType<typeof getCommissionTracking>>;
  clients: Awaited<ReturnType<typeof getClientPortfolio>>;
}

function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

export function buildCourtierCockpit(
  input: CourtierCockpitInput,
  now: number = Date.now(),
): CockpitSummaryData {
  const { credits, policies, commissions, clients } = input;

  // ---------------------------------------------------------------------
  // PRIORITÉS DU JOUR
  // ---------------------------------------------------------------------
  const priorities: CockpitSignal[] = [];

  // credit-decision-imminent [avail=true] : décision banque ≤7j → faire avancer
  const creditDecisionImminent = credits.filter((c) => {
    if (c.status !== 'En cours') return false;
    const d = daysUntil(c.expected_decision_date, now);
    return d !== null && d >= 0 && d <= 7;
  });
  if (creditDecisionImminent.length) {
    priorities.push({
      id: 'priority:credit-decision-imminent',
      label: `${creditDecisionImminent.length} crédit(s) en attente de décision banque ≤7j : faire avancer le dossier`,
      detail: 'Appeler la banque, compléter les pièces manquantes',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // policy-renewal-due [avail=true] : polices expirant ≤30j sans auto-renouvellement
  const renewalDue = policies.filter((p) => {
    if (p.status !== 'Active') return false;
    if (p.auto_renewal !== false) return false;
    const d = daysUntil(p.end_date, now);
    return d !== null && d >= 0 && d <= 30;
  });
  if (renewalDue.length) {
    priorities.push({
      id: 'priority:policy-renewal-due',
      label: `${renewalDue.length} police(s) expirant ≤30j sans auto-renouvellement : renouveler maintenant`,
      detail: 'Cliquer Renouveler ou contacter le client avant end_date',
      href: '#dashboard-entreprise',
      tone: 'urgent',
    });
  }

  // quote-to-convert [avail=true] : devis d'assurance en attente → transformer en police
  const quotesToConvert = policies.filter((p) => p.status === 'Devis');
  if (quotesToConvert.length) {
    priorities.push({
      id: 'priority:quote-to-convert',
      label: `${quotesToConvert.length} devis d'assurance en attente : transformer en police active`,
      detail: 'Relancer le client, passer la police de Devis à Active',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // ---------------------------------------------------------------------
  // RISQUES
  // ---------------------------------------------------------------------
  const risks: CockpitSignal[] = [];

  // credit-stale-no-decision [avail=true] : 'En cours' dont la décision attendue est dépassée
  const creditStale = credits.filter((c) => {
    if (c.status !== 'En cours') return false;
    const d = daysUntil(c.expected_decision_date, now);
    return d !== null && d < 0;
  });
  if (creditStale.length) {
    risks.push({
      id: 'risk:credit-stale-no-decision',
      label: `${creditStale.length} crédit(s) 'En cours' dont la date de décision attendue est dépassée`,
      detail: 'Appeler la banque pour obtenir le verdict, puis mettre à jour le statut',
      href: '#dashboard-entreprise',
      tone: 'warn',
    });
  }

  // policy-with-claims [avail=true] : polices actives avec sinistres déclarés
  const policiesWithClaims = policies.filter(
    (p) => Number(p.claim_count || 0) > 0 && p.status === 'Active',
  );
  if (policiesWithClaims.length) {
    risks.push({
      id: 'risk:policy-with-claims',
      label: `${policiesWithClaims.length} police(s) avec sinistres déclarés : surveiller avant renouvellement`,
      detail: 'Examiner l\'historique sinistre et préparer le renouvellement / réajustement de prime',
      href: '#dashboard-entreprise',
      tone: 'neutral',
    });
  }

  // ---------------------------------------------------------------------
  // OPPORTUNITÉS
  // ---------------------------------------------------------------------
  const opportunities: CockpitSignal[] = [];

  // cross-sell-credit-to-uninsured [avail=true] : crédit décaissé mais SANS police
  const crossSell = clients.filter((c) => c.activeCredits > 0 && c.activePolicies === 0);
  if (crossSell.length) {
    opportunities.push({
      id: 'opp:cross-sell-credit-to-uninsured',
      label: `${crossSell.length} client(s) avec crédit décaissé mais SANS police d'assurance : proposer une couverture`,
      detail: 'Appeler le client et créer un devis (status Devis)',
      href: '#dashboard-entreprise',
      tone: 'good',
    });
  }

  // reactivate-prospect [avail=true] : prospects sans aucun dossier
  const prospects = clients.filter(
    (c) => c.status === 'Prospect' && c.activeCredits === 0 && c.activePolicies === 0,
  );
  if (prospects.length) {
    opportunities.push({
      id: 'opp:reactivate-prospect',
      label: `${prospects.length} prospect(s) sans aucun dossier : convertir en premier crédit ou police`,
      detail: 'Ouvrir la fiche prospect et initier une demande de crédit ou un devis assurance',
      href: '#dashboard-entreprise',
      tone: 'neutral',
    });
  }

  // ---------------------------------------------------------------------
  // HEADLINE [MAD] : commissions encaissées + pipeline (mois courant et année)
  // ---------------------------------------------------------------------
  return {
    revenueLabel: 'Commissions (ce mois)',
    revenueValue: commissions.monthCommission,
    revenueUnit: 'MAD',
    revenueAvailable: true,
    revenueHint: `${commissions.monthCommission.toLocaleString('fr-FR')} MAD ce mois · ${commissions.totalCommission.toLocaleString('fr-FR')} MAD cumulé · crédit ${commissions.creditCommission.toLocaleString('fr-FR')} / assurance ${commissions.policyCommission.toLocaleString('fr-FR')}`,
    priorities,
    risks,
    opportunities,
  };
}
