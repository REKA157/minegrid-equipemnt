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
import { rankPartners, type PartnerCandidate } from './partnerMatching';
import type {
  InspectionRequestRow,
  TransportRequestRow,
  FinancingRequestRow,
  CustomsCaseRow,
} from '../api/transactionPlatform';

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
}

/** Performance de l'utilisateur courant sur SES étapes assignées (uid filtré). */
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
  return { role, kpis, score };
}

/**
 * Carte cockpit « Ma performance » — anti-façade : rien si aucune assignation réelle.
 * Mène toujours à une action (traiter les dossiers ouverts) ou est un signal positif.
 */
export function buildPerformanceSignals(perf: PartnerPerformance): CockpitSignal[] {
  const { kpis, score } = perf;
  if (kpis.volume === 0) return []; // aucune donnée -> aucune carte
  const pct = score.score != null ? `${score.score}/100` : '—';
  const comp = Math.round(kpis.completionRate * 100);
  const delay = kpis.avgProcessingDays != null ? `${kpis.avgProcessingDays.toFixed(1)} j` : '—';

  if (kpis.open > 0) {
    const lateTxt = kpis.lateRate != null ? ` · retard ${Math.round(kpis.lateRate * 100)}%` : '';
    return [
      {
        id: 'perf:partner-open',
        label: `${kpis.open} dossier(s) à traiter — score ${pct}, complétion ${comp}%`,
        detail: `Délai moyen ${delay}${lateTxt}. Traite tes dossiers ouverts pour améliorer ton score.`,
        href: '#dossiers',
        tone: kpis.lateRate != null && kpis.lateRate > 0.2 ? 'urgent' : 'warn',
      },
    ];
  }
  return [
    {
      id: 'perf:partner-score',
      label: `Performance : score ${pct} (${kpis.completedSuccess} traités)`,
      detail: `Complétion ${comp}%, délai moyen ${delay}. Accepte vite tes prochaines invitations pour rester bien classé.`,
      href: '#dossiers',
      tone: 'good',
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
