/**
 * Partner Performance Engine — intégration : adapte les lignes RÉELLES des tables
 * de chaîne au moteur (KPIs/score/matching) et produit des signaux cockpit.
 * Anti-façade : aucune carte si pas de donnée réelle ; aucune valeur simulée.
 */
import supabase from '../supabaseClient';
import type { CockpitSignal } from '../../components/dashboard/cockpit/buildVendeurCockpit';
import { ROLE_CONFIG, type PartnerRole } from './partnerEvents';
import { computePartnerKpis, type ChainAssignment, type PartnerKpis, type AcceptanceKpis } from './partnerKpis';
import { computePartnerScore, type PartnerScore } from './partnerScore';
import { computePartnerTrust, trustTierLabel, type PartnerTrust } from './partnerTrust';
import { rankPartners, type PartnerCandidate } from './partnerMatching';
import {
  inspectionService,
  transportRequestService,
  financingRequestService,
  customsCaseService,
  type InspectionRequestRow,
  type TransportRequestRow,
  type FinancingRequestRow,
  type CustomsCaseRow,
} from '../api/transactionPlatform';
import { listAccessibleTransactionCases } from '../api/transactionCases';

const EMPTY_ACCEPTANCE: AcceptanceKpis = {
  invited: 0,
  accepted: 0,
  declinedOrRevoked: 0,
  acceptanceRate: 0,
  avgAcceptanceHours: null,
};

/** Ligne normalisée : assignee + champs d'exécution. */
interface AssigneeRow extends ChainAssignment {
  partnerId: string | null;
}

export const adaptInspections = (rows: InspectionRequestRow[]): AssigneeRow[] =>
  rows.map((r) => ({
    partnerId: r.assigned_to,
    status: r.status,
    createdAt: r.created_at,
    completedAt: null, // inspection_requests n'expose pas updated_at
    dueAt: r.scheduled_at,
  }));

export const adaptTransports = (rows: TransportRequestRow[]): AssigneeRow[] =>
  rows.map((r) => ({
    partnerId: r.transporter_id,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.updated_at,
    dueAt: r.eta,
  }));

export const adaptFinancings = (rows: FinancingRequestRow[]): AssigneeRow[] =>
  rows.map((r) => ({
    partnerId: r.broker_id,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.updated_at,
    dueAt: null,
  }));

export const adaptCustoms = (rows: CustomsCaseRow[]): AssigneeRow[] =>
  rows.map((r) => ({
    partnerId: r.forwarder_id,
    status: r.customs_status,
    createdAt: r.created_at,
    completedAt: r.updated_at,
    dueAt: null,
  }));

export interface PartnerPerformance {
  role: PartnerRole;
  kpis: PartnerKpis;
  score: PartnerScore;
  trust: PartnerTrust;
}

/** Performance + trust de l'utilisateur courant sur SES étapes assignées (uid filtré). */
export function computeMyPerformance(
  role: PartnerRole,
  rows: AssigneeRow[],
  myUserId: string | null,
): PartnerPerformance {
  const cfg = ROLE_CONFIG[role];
  const mine = myUserId ? rows.filter((r) => r.partnerId === myUserId) : [];
  const assignments: ChainAssignment[] = mine.map(({ status, createdAt, completedAt, dueAt }) => ({
    status,
    createdAt,
    completedAt,
    dueAt,
  }));
  const kpis = computePartnerKpis(assignments, cfg);
  const score = computePartnerScore(kpis, EMPTY_ACCEPTANCE);
  const trust = computePartnerTrust(kpis, EMPTY_ACCEPTANCE, score);
  return { role, kpis, score, trust };
}

/**
 * Carte cockpit « Ma performance » — anti-façade : rien si aucune assignation réelle.
 * Mène toujours à une action (traiter les dossiers ouverts) ou est un signal positif.
 */
export function buildPerformanceSignals(perf: PartnerPerformance): CockpitSignal[] {
  const { kpis, score, trust } = perf;
  if (kpis.volume === 0) return []; // aucune donnée -> aucune carte
  const pct = score.score != null ? `${score.score}/100` : '—';
  const comp = Math.round(kpis.completionRate * 100);
  const delay = kpis.avgProcessingDays != null ? `${kpis.avgProcessingDays.toFixed(1)} j` : '—';
  // Mention du tier de confiance seulement s'il est mesuré (anti-façade).
  const trustTxt = trust.hasData ? ` · confiance ${trustTierLabel(trust.tier)}` : '';

  if (kpis.open > 0) {
    const lateTxt = kpis.lateRate != null ? ` · retard ${Math.round(kpis.lateRate * 100)}%` : '';
    return [
      {
        id: 'perf:partner-open',
        label: `${kpis.open} dossier(s) à traiter — score ${pct}${trustTxt}`,
        detail: `Complétion ${comp}%, délai moyen ${delay}${lateTxt}. Traite tes dossiers ouverts pour améliorer ta confiance.`,
        href: '#dossiers',
        tone: kpis.lateRate != null && kpis.lateRate > 0.2 ? 'urgent' : 'warn',
      },
    ];
  }
  // open === 0 : tout est terminal. Ne JAMAIS afficher un succès vert si rien n'a
  // réellement abouti (anti-façade : un 'good' suppose une vraie réussite).
  const realSuccess = kpis.completedSuccess > 0 && kpis.completionRate >= 0.5;
  return [
    {
      id: 'perf:partner-score',
      label: `Confiance ${trust.hasData ? trustTierLabel(trust.tier) : '—'} — score ${pct} (${kpis.completedSuccess} traités)`,
      detail: realSuccess
        ? `Complétion ${comp}%, délai moyen ${delay}. Accepte vite tes prochaines invitations pour progresser vers le niveau supérieur.`
        : `Complétion ${comp}% — ${kpis.volume - kpis.completedSuccess} dossier(s) non aboutis. Améliore ton taux de complétion pour remonter.`,
      href: '#dossiers',
      tone: realSuccess ? 'good' : 'warn',
    },
  ];
}

/** Classe les partenaires d'un rôle à partir des lignes réelles (matching). */
export function rankPartnersFromRows(role: PartnerRole, rows: AssigneeRow[]): PartnerCandidate[] {
  const cfg = ROLE_CONFIG[role];
  const byPartner = new Map<string, ChainAssignment[]>();
  for (const r of rows) {
    if (!r.partnerId) continue;
    const list = byPartner.get(r.partnerId) ?? [];
    list.push({ status: r.status, createdAt: r.createdAt, completedAt: r.completedAt, dueAt: r.dueAt });
    byPartner.set(r.partnerId, list);
  }
  const candidates: PartnerCandidate[] = [];
  byPartner.forEach((assignments, partnerId) => {
    const kpis = computePartnerKpis(assignments, cfg);
    candidates.push({ partnerId, score: computePartnerScore(kpis, EMPTY_ACCEPTANCE) });
  });
  return rankPartners(candidates);
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Agrège les lignes d'un rôle sur tous les dossiers accessibles (RLS). Tolérant. */
async function fetchRoleAssignments(role: PartnerRole): Promise<AssigneeRow[]> {
  const cases = await listAccessibleTransactionCases();
  const ids = (Array.isArray(cases) ? cases : []).slice(0, 50).map((c) => c.id);
  if (!ids.length) return [];
  const settled = await Promise.allSettled(
    ids.map((id) => {
      switch (role) {
        case 'mechanic':
          return inspectionService.listRequestsByCase(id).then(adaptInspections);
        case 'carrier':
          return transportRequestService.listByCase(id).then(adaptTransports);
        case 'broker':
          return financingRequestService.listByCase(id).then(adaptFinancings);
        case 'forwarder':
          return customsCaseService.listByCase(id).then(adaptCustoms);
        default:
          return Promise.resolve([] as AssigneeRow[]);
      }
    }),
  );
  return settled.flatMap((s) => (s.status === 'fulfilled' && s.value ? s.value : []));
}

/**
 * Matching : classe les partenaires d'un rôle par score réel (sur les dossiers
 * accessibles). Renvoie [] si aucune donnée — jamais de recommandation à vide.
 */
export async function loadPartnerRankingForRole(role: PartnerRole): Promise<PartnerCandidate[]> {
  try {
    return rankPartnersFromRows(role, await fetchRoleAssignments(role));
  } catch {
    return [];
  }
}
