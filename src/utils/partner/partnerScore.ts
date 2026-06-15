/**
 * Partner Performance Engine — score partenaire (PUR, testable).
 *
 * Le score n'agrège QUE des métriques réellement mesurables : une métrique sans
 * donnée est EXCLUE du calcul (pas pénalisée par un 0 arbitraire). Si aucune
 * métrique n'est mesurable -> hasData=false, score null (anti-façade : on n'affiche
 * pas de score inventé).
 */
import type { PartnerKpis, AcceptanceKpis } from './partnerKpis';

export interface ScoreComponent {
  key: 'fiabilite' | 'acceptation' | 'traitement' | 'ponctualite' | 'volume';
  label: string;
  value: number; // 0..1 (normalisé)
  weight: number;
}

export interface PartnerScore {
  hasData: boolean;
  score: number | null; // 0..100 ; null si aucune donnée
  components: ScoreComponent[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const DECAY_ACCEPTANCE_HOURS = 48; // accepter en <48h = excellent
const DECAY_PROCESSING_DAYS = 14; // traiter en <14j = excellent
const VOLUME_TARGET = 10; // 10 dossiers traités = plein crédit volume

/**
 * Calcule le score partenaire à partir des KPIs d'exécution + d'acceptation.
 * Pondérations : fiabilité 0.35, acceptation 0.2, traitement 0.2, ponctualité 0.15, volume 0.1.
 */
export function computePartnerScore(kpis: PartnerKpis, acc: AcceptanceKpis): PartnerScore {
  const components: ScoreComponent[] = [];

  // Fiabilité = taux de complétion (uniquement si au moins une étape terminée).
  const terminalCount = kpis.completedSuccess + (kpis.volume - kpis.open - kpis.completedSuccess);
  if (terminalCount > 0) {
    components.push({ key: 'fiabilite', label: 'Fiabilité (complétion)', value: clamp01(kpis.completionRate), weight: 0.35 });
  }
  // Acceptation rapide.
  if (acc.avgAcceptanceHours != null) {
    components.push({
      key: 'acceptation',
      label: 'Rapidité d’acceptation',
      value: clamp01(1 - acc.avgAcceptanceHours / DECAY_ACCEPTANCE_HOURS),
      weight: 0.2,
    });
  }
  // Rapidité de traitement.
  if (kpis.avgProcessingDays != null) {
    components.push({
      key: 'traitement',
      label: 'Rapidité de traitement',
      value: clamp01(1 - kpis.avgProcessingDays / DECAY_PROCESSING_DAYS),
      weight: 0.2,
    });
  }
  // Ponctualité (faible retard) — seulement si une échéance existe.
  if (kpis.lateRate != null) {
    components.push({ key: 'ponctualite', label: 'Ponctualité', value: clamp01(1 - kpis.lateRate), weight: 0.15 });
  }
  // Volume traité.
  if (kpis.volume > 0) {
    components.push({ key: 'volume', label: 'Volume traité', value: clamp01(kpis.volume / VOLUME_TARGET), weight: 0.1 });
  }

  if (components.length === 0) {
    return { hasData: false, score: null, components: [] };
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weighted = components.reduce((s, c) => s + c.value * c.weight, 0);
  const score = Math.round((weighted / totalWeight) * 100);
  return { hasData: true, score, components };
}
