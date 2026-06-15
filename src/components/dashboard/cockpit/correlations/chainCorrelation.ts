import type {
  InspectionRequestRow,
  FinancingRequestRow,
  TransportRequestRow,
  CustomsCaseRow,
  PaymentRecordRow,
} from '../../../../utils/api/transactionPlatform';
import type { PendingInvitationRow } from '../../../../utils/api/transactionCases';
import type { CockpitSignal } from '../buildVendeurCockpit';

/**
 * CORRÉLATIONS M4-M7 — chaîne du dossier transaction.
 *
 * Croisent `transaction_cases` (RLS réel) avec les tables d'exécution du dossier
 * (`inspection_requests`, `payment_records`, `financing_requests`,
 * `transport_requests`, `customs_cases`) via les services `…Service.listByCase`.
 *
 * Fonctions PURES et testables. Anti-façade : ne renvoient une carte que si des
 * lignes RÉELLES existent. Ces tables sont aujourd'hui en schéma-seulement (non
 * peuplées) : les cartes restent donc invisibles jusqu'au peuplement par un
 * workflow dossier serveur (cf. backlog L3/L4) — aucune donnée n'est simulée.
 *
 *  - M4 inspection → intervention (mécanicien) : inspections de dossier à réaliser.
 *  - M5 inspection → escrow (financier)        : paiements de dossier en attente.
 *  - M6 escrow → finance (courtier/financier)  : financements de dossier à monter.
 *  - M7 finance → transport (transporteur/log.) : missions transport de dossier.
 *  - douane (transitaire)                       : dossiers douane à traiter.
 */

function lc(s: string | null | undefined): string {
  return (s || '').toLowerCase();
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const DONE_INSPECTION = new Set(['completed', 'cancelled', 'done']);
export function buildInspectionCaseSignals(rows: InspectionRequestRow[]): CockpitSignal[] {
  const pending = rows.filter((r) => !DONE_INSPECTION.has(lc(r.status)));
  if (!pending.length) return [];
  return [
    {
      id: 'corr:case-inspection',
      label: `${pending.length} inspection(s) de dossier à réaliser`,
      detail: "Inspecter l'engin pour débloquer le paiement (escrow)",
      href: '#dossiers',
      tone: 'urgent',
    },
  ];
}

const DONE_FINANCING = new Set(['approved', 'funded', 'rejected', 'cancelled']);
export function buildFinancingCaseSignals(rows: FinancingRequestRow[]): CockpitSignal[] {
  const open = rows.filter((r) => !DONE_FINANCING.has(lc(r.status)));
  if (!open.length) return [];
  return [
    {
      id: 'corr:case-financing',
      label: `${open.length} financement(s) de dossier à monter`,
      detail: 'Compléter le montage et soumettre au partenaire',
      href: '#dossiers',
      tone: 'warn',
    },
  ];
}

const DONE_TRANSPORT = new Set(['delivered', 'cancelled']);
export function buildTransportCaseSignals(rows: TransportRequestRow[]): CockpitSignal[] {
  const open = rows.filter((r) => !DONE_TRANSPORT.has(lc(r.status)));
  if (!open.length) return [];
  return [
    {
      id: 'corr:case-transport',
      label: `${open.length} mission(s) transport de dossier à planifier`,
      detail: "Affecter véhicule/chauffeur et fixer l'enlèvement",
      href: '#dossiers',
      tone: 'warn',
    },
  ];
}

const CLEARED = new Set(['cleared', 'closed']);
export function buildCustomsCaseSignals(rows: CustomsCaseRow[]): CockpitSignal[] {
  const open = rows.filter((r) => !CLEARED.has(lc(r.customs_status)) || arr(r.missing_documents).length > 0);
  if (!open.length) return [];
  return [
    {
      id: 'corr:case-customs',
      label: `${open.length} dossier(s) douane à traiter`,
      detail: 'Compléter les documents manquants pour dédouaner',
      href: '#dossiers',
      tone: 'urgent',
    },
  ];
}

/**
 * Invitations partenaire EN ATTENTE (accepted_at NULL) reçues par l'utilisateur.
 * Le filtre est fait côté requête (listPendingInvitationsWithCase) ; on fait
 * confiance aux lignes reçues, comme les autres corrélations. Anti-façade : [] si aucune.
 */
export function buildPendingInvitationSignals(rows: PendingInvitationRow[]): CockpitSignal[] {
  if (!rows.length) return [];
  const first = rows[0];
  const detail =
    rows.length === 1 && first.case_title
      ? `Dossier « ${first.case_title} » — confirmez votre participation`
      : 'Confirmez ou déclinez votre participation au dossier';
  return [
    {
      id: 'corr:pending-invitations',
      label: `${rows.length} invitation(s) en attente — Accepter/Refuser`,
      detail,
      href: '#dossiers',
      tone: 'warn',
    },
  ];
}

const PAYMENT_PENDING = new Set(['pending', 'held', 'in_escrow', 'awaiting', 'awaiting_partner', 'escrow']);
export function buildPaymentCaseSignals(rows: PaymentRecordRow[]): CockpitSignal[] {
  const pending = rows.filter((r) => PAYMENT_PENDING.has(lc(r.status)));
  if (!pending.length) return [];
  return [
    {
      id: 'corr:case-payment',
      label: `${pending.length} paiement(s) de dossier en attente (escrow)`,
      detail: 'Vérifier les conditions et débloquer le paiement',
      href: '#dossiers',
      tone: 'urgent',
    },
  ];
}
