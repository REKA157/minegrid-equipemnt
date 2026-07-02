/**
 * Insights ASSIGNATION PARTENAIRE au niveau DOSSIER (anti-façade) :
 *  - étape de chaîne ACTIVE mais SANS partenaire assigné + un partenaire fiable
 *    disponible (Partner Network.best) -> assigner (reco #4) ;
 *  - étape ACTIVE assignée à un partenaire SATURÉ (Partner Network.saturated) ->
 *    réassigner ou relancer (reco #5).
 *
 * Sources réelles : transaction_cases (dossiers accessibles RLS) × chaîne par rôle
 * (inspection_requests.assigned_to / transport_requests.transporter_id /
 *  financing_requests.broker_id / customs_cases.forwarder_id) × buildNetworkForRole.
 *
 * Le cœur (derivePartnerInsights) est PUR/testable ; le loader est tolérant (vide si
 * table absente / pas de donnée). Aucune reco si aucune étape réelle ne la justifie.
 */
import supabase from '../supabaseClient';
import { listAccessibleTransactionCases } from '../api/transactionCases';
import { buildNetworkForRole } from '../partner/partnerPerformanceService';
import type { PartnerRole } from '../partner/partnerEvents';

export interface ChainStepLite {
  caseId: string;
  partnerId: string | null;
  terminal: boolean;
}

export interface RoleNetworkLite {
  hasBest: boolean;
  saturatedIds: Set<string>;
}

export interface PartnerAssignGap {
  caseId: string;
  title: string;
  role: PartnerRole;
  roleLabel: string;
}

export interface PartnerSaturation {
  caseId: string;
  title: string;
  role: PartnerRole;
  roleLabel: string;
  partnerId: string;
}

export interface PartnerAssignmentInsights {
  gaps: PartnerAssignGap[];
  saturations: PartnerSaturation[];
}

const ROLES: PartnerRole[] = ['mechanic', 'carrier', 'broker', 'forwarder'];

const ROLE_LABEL: Record<PartnerRole, string> = {
  mechanic: 'mécanicien (inspection)',
  carrier: 'transporteur',
  broker: 'courtier (financement)',
  forwarder: 'transitaire (douane)',
};

// Table de chaîne + colonne FK partenaire + colonne statut, par rôle (cf. cartographie).
const ROLE_SRC: Record<PartnerRole, { table: string; fk: string; statusCol: string }> = {
  mechanic: { table: 'inspection_requests', fk: 'assigned_to', statusCol: 'status' },
  carrier: { table: 'transport_requests', fk: 'transporter_id', statusCol: 'status' },
  broker: { table: 'financing_requests', fk: 'broker_id', statusCol: 'status' },
  forwarder: { table: 'customs_cases', fk: 'forwarder_id', statusCol: 'customs_status' },
};

// Statuts TERMINAUX par rôle : une étape terminale n'a plus besoin de partenaire.
const TERMINAL: Record<PartnerRole, Set<string>> = {
  mechanic: new Set(['completed', 'done', 'cancelled']),
  carrier: new Set(['delivered', 'cancelled']),
  broker: new Set(['funded', 'rejected', 'cancelled']),
  forwarder: new Set(['cleared', 'closed', 'cancelled']),
};

const EMPTY: PartnerAssignmentInsights = { gaps: [], saturations: [] };

/**
 * PUR : croise les étapes de chaîne réelles avec le réseau partenaire pour produire
 * les manques d'assignation (avec meilleur dispo) et les saturations (assigné mais saturé).
 */
export function derivePartnerInsights(
  titleByCase: Map<string, string>,
  stepsByRole: Record<PartnerRole, ChainStepLite[]>,
  networkByRole: Record<PartnerRole, RoleNetworkLite>,
): PartnerAssignmentInsights {
  const gaps: PartnerAssignGap[] = [];
  const saturations: PartnerSaturation[] = [];

  for (const role of ROLES) {
    const steps = stepsByRole[role] ?? [];
    const net = networkByRole[role] ?? { hasBest: false, saturatedIds: new Set<string>() };
    const gapSeen = new Set<string>();
    const satSeen = new Set<string>();

    for (const s of steps) {
      if (s.terminal) continue;
      if (!s.partnerId) {
        // Étape active non assignée -> reco SEULEMENT si un meilleur partenaire existe.
        if (net.hasBest && !gapSeen.has(s.caseId)) {
          gapSeen.add(s.caseId);
          gaps.push({ caseId: s.caseId, title: titleByCase.get(s.caseId) ?? s.caseId, role, roleLabel: ROLE_LABEL[role] });
        }
      } else if (net.saturatedIds.has(s.partnerId)) {
        const key = `${s.caseId}|${s.partnerId}`;
        if (!satSeen.has(key)) {
          satSeen.add(key);
          saturations.push({
            caseId: s.caseId,
            title: titleByCase.get(s.caseId) ?? s.caseId,
            role,
            roleLabel: ROLE_LABEL[role],
            partnerId: s.partnerId,
          });
        }
      }
    }
  }
  return { gaps, saturations };
}

export async function loadPartnerAssignmentInsights(): Promise<PartnerAssignmentInsights> {
  try {
    const cases = await listAccessibleTransactionCases();
    const open = cases.filter((c) => c.status !== 'closed' && c.status !== 'cancelled');
    if (!open.length) return EMPTY;

    const caseIds = open.map((c) => c.id);
    const titleByCase = new Map<string, string>();
    for (const c of open) titleByCase.set(c.id, c.title?.trim() || `Dossier ${c.id.slice(0, 8)}`);

    const stepsByRole = {} as Record<PartnerRole, ChainStepLite[]>;
    const networkByRole = {} as Record<PartnerRole, RoleNetworkLite>;

    await Promise.all(
      ROLES.map(async (role) => {
        const src = ROLE_SRC[role];
        let steps: ChainStepLite[] = [];
        try {
          const { data } = await supabase
            .from(src.table)
            .select(`transaction_case_id, ${src.fk}, ${src.statusCol}`)
            .in('transaction_case_id', caseIds);
          steps = ((data ?? []) as Array<Record<string, unknown>>)
            .map((r) => ({
              caseId: String(r['transaction_case_id'] ?? ''),
              partnerId: (r[src.fk] as string | null) ?? null,
              terminal: TERMINAL[role].has(String(r[src.statusCol] ?? '').toLowerCase()),
            }))
            .filter((s) => s.caseId);
        } catch {
          steps = [];
        }
        stepsByRole[role] = steps;

        let net: RoleNetworkLite = { hasBest: false, saturatedIds: new Set<string>() };
        try {
          const n = await buildNetworkForRole(role);
          net = { hasBest: n.best != null, saturatedIds: new Set(n.saturated.map((p) => p.partnerId)) };
        } catch {
          /* réseau indisponible -> net vide */
        }
        networkByRole[role] = net;
      }),
    );

    return derivePartnerInsights(titleByCase, stepsByRole, networkByRole);
  } catch {
    return EMPTY;
  }
}
