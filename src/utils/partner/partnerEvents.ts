/**
 * Partner Performance Engine — normalisation des events & configuration par rôle.
 *
 * Source de vérité : `transaction_events` (events réellement produits par les RPC
 * write-side) + les tables de chaîne (assignation + statut + dates). AUCUNE donnée
 * simulée : tout dérive de lignes réelles.
 */

export type PartnerRole = 'mechanic' | 'carrier' | 'broker' | 'forwarder';

/** event_type réellement émis dans transaction_events (cf. RPC create_*_step / assign / accept). */
export const PARTNER_EVENT_TYPES = [
  'inspection.requested',
  'transport.requested',
  'financing.requested',
  'customs.opened',
  'participant.assigned',
  'participant.accepted',
  'participant.declined',
  'participant.revoked',
] as const;

export type PartnerEventCategory =
  | 'step_requested' // une étape de chaîne a été demandée
  | 'assigned' // un partenaire a été invité
  | 'accepted' // le partenaire a accepté
  | 'declined' // le partenaire a refusé
  | 'revoked' // le partenaire a été retiré
  | 'other';

/** Mapper event → catégorie KPI (normalisation, insensible aux variantes inconnues). */
export function categorizeEvent(eventType: string | null | undefined): PartnerEventCategory {
  switch ((eventType || '').trim()) {
    case 'inspection.requested':
    case 'transport.requested':
    case 'financing.requested':
    case 'customs.opened':
      return 'step_requested';
    case 'participant.assigned':
      return 'assigned';
    case 'participant.accepted':
      return 'accepted';
    case 'participant.declined':
      return 'declined';
    case 'participant.revoked':
      return 'revoked';
    default:
      return 'other';
  }
}

/**
 * Configuration de chaîne par rôle partenaire : quel statut = succès, quels statuts
 * sont terminaux (fin de cycle), et le champ "échéance" exploitable s'il existe.
 * (Reflète sql/2026-06_transaction_chain_write_side.sql + transaction_platform_extended.)
 */
export interface RoleChainConfig {
  role: PartnerRole;
  label: string;
  /** Statuts considérés « complétés avec succès ». */
  success: ReadonlySet<string>;
  /** Tous les statuts terminaux (succès + échec/annulation). */
  terminal: ReadonlySet<string>;
  /** Un champ d'échéance existe-t-il pour calculer le retard ? (false => lateRate non calculable). */
  hasDeadline: boolean;
}

export const ROLE_CONFIG: Record<PartnerRole, RoleChainConfig> = {
  mechanic: {
    role: 'mechanic',
    label: 'Mécanicien / Inspecteur',
    success: new Set(['completed', 'done']),
    terminal: new Set(['completed', 'done', 'cancelled']),
    hasDeadline: true, // inspection_requests.scheduled_at
  },
  carrier: {
    role: 'carrier',
    label: 'Transporteur',
    success: new Set(['delivered']),
    terminal: new Set(['delivered', 'cancelled']),
    hasDeadline: true, // transport_requests.eta
  },
  broker: {
    role: 'broker',
    label: 'Courtier / Financier',
    success: new Set(['approved', 'funded']),
    terminal: new Set(['approved', 'funded', 'rejected', 'cancelled']),
    hasDeadline: false, // pas d'échéance fiable sur financing_requests
  },
  forwarder: {
    role: 'forwarder',
    label: 'Transitaire',
    success: new Set(['cleared']),
    terminal: new Set(['cleared', 'closed']),
    hasDeadline: false, // pas d'échéance fiable sur customs_cases
  },
};

export function lc(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}
