/**
 * Partner Performance Engine — calcul des KPIs (fonctions PURES, testables).
 * Tout dérive de lignes RÉELLES. Aucune valeur inventée, aucun Math.random.
 * Données absentes => valeurs nulles explicites (jamais de faux chiffre).
 */
import type { RoleChainConfig } from './partnerEvents';
import { lc } from './partnerEvents';

/** Une assignation normalisée d'un partenaire sur une étape de chaîne. */
export interface ChainAssignment {
  status: string;
  createdAt: string;
  /** date de dernière mise à jour (≈ complétion si terminal) ; null si la table n'en a pas. */
  completedAt: string | null;
  /** échéance exploitable (scheduled_at / eta) ; null si aucune. */
  dueAt: string | null;
}

export interface PartnerKpis {
  volume: number; // total d'étapes assignées
  open: number; // en cours (non terminal)
  completedSuccess: number; // terminé avec succès
  completionRate: number; // completedSuccess / terminal (0..1), 0 si aucun terminal
  avgProcessingDays: number | null; // moyenne (completedAt - createdAt) pour les complétés ; null si non calculable
  lateRate: number | null; // retard parmi ceux qui ont une échéance ; null si aucune échéance
}

function daysBetween(a: string, b: string): number | null {
  const t0 = Date.parse(a);
  const t1 = Date.parse(b);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return (t1 - t0) / 86400000;
}

/** KPIs d'exécution d'un partenaire sur ses étapes assignées. */
export function computePartnerKpis(rows: ChainAssignment[], cfg: RoleChainConfig): PartnerKpis {
  const volume = rows.length;
  let open = 0;
  let completedSuccess = 0;
  let terminalCount = 0;
  const processingDays: number[] = [];
  let withDeadline = 0;
  let late = 0;

  for (const r of rows) {
    const status = lc(r.status);
    const isTerminal = cfg.terminal.has(status);
    if (!isTerminal) {
      open += 1;
    } else {
      terminalCount += 1;
      if (cfg.success.has(status)) {
        completedSuccess += 1;
        // Délai de traitement (si la table fournit completedAt).
        if (r.completedAt) {
          const d = daysBetween(r.createdAt, r.completedAt);
          if (d != null && d >= 0) processingDays.push(d);
        }
        // Retard : complété après l'échéance.
        if (cfg.hasDeadline && r.dueAt && r.completedAt) {
          withDeadline += 1;
          const over = daysBetween(r.dueAt, r.completedAt);
          if (over != null && over > 0) late += 1;
        }
      }
    }
  }

  return {
    volume,
    open,
    completedSuccess,
    completionRate: terminalCount > 0 ? completedSuccess / terminalCount : 0,
    avgProcessingDays:
      processingDays.length > 0
        ? processingDays.reduce((a, b) => a + b, 0) / processingDays.length
        : null,
    lateRate: withDeadline > 0 ? late / withDeadline : null,
  };
}

/** Échantillon d'invitation (depuis transaction_participants). */
export interface AcceptanceSample {
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface AcceptanceKpis {
  invited: number;
  accepted: number;
  declinedOrRevoked: number;
  acceptanceRate: number; // accepted / invited (0..1), 0 si invited 0
  avgAcceptanceHours: number | null; // moyenne (acceptedAt - invitedAt) ; null si aucun accepté
}

/** KPIs de réactivité d'acceptation des invitations. */
export function computeAcceptanceKpis(samples: AcceptanceSample[]): AcceptanceKpis {
  const invited = samples.length;
  let accepted = 0;
  let declinedOrRevoked = 0;
  const hours: number[] = [];
  for (const s of samples) {
    if (s.acceptedAt) {
      accepted += 1;
      const t0 = Date.parse(s.invitedAt);
      const t1 = Date.parse(s.acceptedAt);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) hours.push((t1 - t0) / 3600000);
    } else if (s.revokedAt) {
      declinedOrRevoked += 1;
    }
  }
  return {
    invited,
    accepted,
    declinedOrRevoked,
    acceptanceRate: invited > 0 ? accepted / invited : 0,
    avgAcceptanceHours: hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
  };
}
