// MineGrid Escrow — machine d'état pure (testable, sans I/O).
// Les transitions réelles sont écrites côté serveur (webhook PSP signé) ; cette
// logique en est la SOURCE DE VÉRITÉ partagée (validation client + serveur).

export type EscrowStatus =
  | 'created'
  | 'funded'
  | 'inspection_passed'
  | 'delivered'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export interface EscrowConditions {
  inspection: boolean; // libération conditionnée à une inspection certifiée
  delivery: boolean; // libération conditionnée à une livraison confirmée
}

export interface ReleaseSignals {
  inspectionPassed: boolean;
  deliveryConfirmed: boolean;
}

// Transitions autorisées. Tout ce qui n'est pas listé est interdit.
const TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  created: ['funded', 'cancelled'],
  funded: ['inspection_passed', 'disputed', 'refunded', 'cancelled'],
  inspection_passed: ['delivered', 'disputed', 'refunded'],
  delivered: ['released', 'disputed'],
  disputed: ['released', 'refunded'],
  released: [],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: EscrowStatus, to: EscrowStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: EscrowStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Conditions de libération des fonds au vendeur. On ne libère QUE depuis l'état
 * 'delivered' ET si toutes les conditions actives sont satisfaites. C'est le cœur
 * anti-arnaque : pas d'inspection OK / pas de livraison confirmée ⇒ pas de libération.
 */
export function canReleaseFunds(
  status: EscrowStatus,
  conditions: EscrowConditions,
  signals: ReleaseSignals,
): boolean {
  if (status !== 'delivered') return false;
  if (conditions.inspection && !signals.inspectionPassed) return false;
  if (conditions.delivery && !signals.deliveryConfirmed) return false;
  return true;
}

// Mappe un événement métier vers l'état cible, en validant la transition.
const EVENT_TARGET: Record<string, EscrowStatus> = {
  funded: 'funded',
  inspection_passed: 'inspection_passed',
  delivery_confirmed: 'delivered',
  released: 'released',
  refunded: 'refunded',
  dispute_opened: 'disputed',
  cancelled: 'cancelled',
};

export function nextOnEvent(status: EscrowStatus, eventType: string): EscrowStatus | null {
  const target = EVENT_TARGET[eventType];
  if (!target) return null;
  return canTransition(status, target) ? target : null;
}
