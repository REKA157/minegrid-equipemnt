/**
 * Scoring go / no-go.
 *
 * 10 critères notés de 0 à 5 par l'utilisateur, pondérés, normalisés en
 * score global sur 100. Le moteur produit une recommandation motivée
 * (raisons, risques, actions) — c'est une aide à la décision : la décision
 * finale reste humaine et est tracée séparément (GoNoGoState.decision).
 */

import type {
  GoNoGoCriterion,
  GoNoGoRecommendation,
  GoNoGoResult,
} from '../types';
import { nowIso } from '../types';

export const DEFAULT_GONOGO_CRITERIA: GoNoGoCriterion[] = [
  {
    id: 'fit',
    label: 'Adéquation métier',
    help: '0 = totalement hors métier, 5 = cœur de métier parfaitement maîtrisé.',
    weight: 15,
    score: 3,
  },
  {
    id: 'delay',
    label: 'Délai disponible pour répondre',
    help: '0 = délai intenable, 5 = temps largement suffisant pour une réponse soignée.',
    weight: 10,
    score: 3,
  },
  {
    id: 'complexity',
    label: 'Complexité du projet',
    help: '0 = très complexe / inconnu, 5 = projet simple et bien maîtrisé.',
    weight: 8,
    score: 3,
  },
  {
    id: 'competition',
    label: 'Position face à la concurrence',
    help: '0 = concurrents beaucoup mieux placés, 5 = avantage concurrentiel net.',
    weight: 10,
    score: 3,
  },
  {
    id: 'margin',
    label: 'Marge estimée',
    help: '0 = marché à perte probable, 5 = marge confortable.',
    weight: 12,
    score: 3,
  },
  {
    id: 'capacity',
    label: 'Capacité interne (équipes, matériel)',
    help: '0 = aucune disponibilité, 5 = moyens disponibles immédiatement.',
    weight: 12,
    score: 3,
  },
  {
    id: 'risk',
    label: 'Risques contractuels',
    help: '0 = clauses très défavorables, 5 = contrat équilibré.',
    weight: 10,
    score: 3,
  },
  {
    id: 'winChance',
    label: 'Chances de gagner',
    help: 'Estimation honnête : 0 = quasi nulles, 5 = très élevées.',
    weight: 10,
    score: 3,
  },
  {
    id: 'workload',
    label: 'Charge de production de la réponse',
    help: '0 = dossier énorme pour nos moyens, 5 = réponse rapide à produire.',
    weight: 6,
    score: 3,
  },
  {
    id: 'admin',
    label: 'Exigences administratives',
    help: '0 = pièces exigées hors de portée, 5 = toutes les pièces disponibles.',
    weight: 7,
    score: 3,
  },
];

/** Libellés pour l'affichage de la recommandation. */
export const RECOMMENDATION_LABELS: Record<GoNoGoRecommendation, string> = {
  repondre: 'Répondre',
  prudence: 'Répondre avec prudence',
  ne_pas_repondre: 'Ne pas répondre',
};

const REASON_BY_CRITERION: Record<string, { good: string; bad: string }> = {
  fit: {
    good: 'Le projet est dans le cœur de métier de l\'entreprise.',
    bad: 'Le projet est éloigné du cœur de métier — courbe d\'apprentissage à prévoir.',
  },
  delay: {
    good: 'Le délai de remise laisse le temps de construire une réponse soignée.',
    bad: 'Le délai de remise est très court pour produire un dossier compétitif.',
  },
  complexity: {
    good: 'La complexité du projet est maîtrisée.',
    bad: 'La complexité du projet est élevée par rapport à l\'expérience disponible.',
  },
  competition: {
    good: 'L\'entreprise dispose d\'un avantage face à la concurrence probable.',
    bad: 'La concurrence attendue est mieux positionnée (références, prix, implantation).',
  },
  margin: {
    good: 'La marge estimée est satisfaisante.',
    bad: 'La marge estimée est faible ou incertaine — risque de marché à perte.',
  },
  capacity: {
    good: 'Les équipes et le matériel nécessaires sont disponibles.',
    bad: 'Les moyens internes (équipes, matériel) sont déjà engagés ailleurs.',
  },
  risk: {
    good: 'Les clauses contractuelles sont équilibrées.',
    bad: 'Des clauses contractuelles défavorables ont été identifiées (pénalités, prix fermes…).',
  },
  winChance: {
    good: 'Les chances de gagner sont jugées bonnes.',
    bad: 'Les chances de gagner sont jugées faibles.',
  },
  workload: {
    good: 'La réponse est rapide à produire.',
    bad: 'La production de la réponse représente une charge importante.',
  },
  admin: {
    good: 'Les pièces administratives exigées sont disponibles.',
    bad: 'Certaines pièces administratives exigées manquent ou sont difficiles à obtenir.',
  },
};

const ACTION_BY_CRITERION: Record<string, string> = {
  fit: 'Envisager un groupement ou un sous-traitant spécialisé pour couvrir les compétences manquantes.',
  delay: 'Réduire le périmètre de la réponse à l\'essentiel et mobiliser la bibliothèque de contenus types.',
  complexity: 'Organiser une revue technique avec le bureau d\'études avant d\'engager la rédaction.',
  competition: 'Identifier un facteur différenciant fort (délai, variante, service) et le mettre en avant dans le mémoire.',
  margin: 'Refaire le chiffrage avec consultation fournisseurs avant de confirmer le go.',
  capacity: 'Vérifier le plan de charge et sécuriser les moyens (location, recrutement, partenaire).',
  risk: 'Lister les clauses à risque et chiffrer les provisions correspondantes dans le prix.',
  winChance: 'Contacter le maître d\'ouvrage (questions écrites) pour affiner la compréhension du besoin.',
  workload: 'Répartir la production entre plusieurs rédacteurs et réutiliser les modèles de la bibliothèque.',
  admin: 'Lancer immédiatement l\'obtention des pièces manquantes (attestations, caution, qualifications).',
};

export interface ScoringOptions {
  /** Jours restants avant la date limite (affine raisons/risques). */
  daysLeft?: number;
  /** Nombre d'exigences non conformes dans la grille. */
  nonCompliantCount?: number;
}

export function computeGoNoGo(
  criteria: GoNoGoCriterion[],
  options: ScoringOptions = {},
): GoNoGoResult {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const weighted = criteria.reduce((sum, c) => sum + (c.score / 5) * c.weight, 0);
  const globalScore = Math.round((weighted / totalWeight) * 100);

  let recommendation: GoNoGoRecommendation;
  if (globalScore >= 65) recommendation = 'repondre';
  else if (globalScore >= 45) recommendation = 'prudence';
  else recommendation = 'ne_pas_repondre';

  // Critères déterminants : un 0 ou 1 sur un critère lourd doit peser sur la
  // recommandation même si la moyenne reste correcte.
  const critical = criteria.filter((c) => c.score <= 1 && c.weight >= 10);
  if (critical.length >= 2 && recommendation === 'repondre') {
    recommendation = 'prudence';
  }
  if (critical.length >= 3) {
    recommendation = 'ne_pas_repondre';
  }

  const sorted = [...criteria].sort((a, b) => b.score - a.score);
  const strengths = sorted.filter((c) => c.score >= 4).slice(0, 3);
  const weaknesses = [...criteria]
    .sort((a, b) => a.score - b.score)
    .filter((c) => c.score <= 2)
    .slice(0, 4);

  const reasons: string[] = [];
  strengths.forEach((c) => {
    const r = REASON_BY_CRITERION[c.id];
    if (r) reasons.push(r.good);
  });
  weaknesses.forEach((c) => {
    const r = REASON_BY_CRITERION[c.id];
    if (r) reasons.push(r.bad);
  });
  if (reasons.length === 0) {
    reasons.push('Profil équilibré : aucun critère ne se détache fortement, la décision repose sur la stratégie commerciale.');
  }

  const risks: string[] = [];
  weaknesses.forEach((c) => {
    const r = REASON_BY_CRITERION[c.id];
    if (r) risks.push(r.bad);
  });
  if (options.daysLeft !== undefined && options.daysLeft <= 7) {
    risks.push(`Il ne reste que ${options.daysLeft} jour(s) avant la date limite de remise.`);
  }
  if (options.nonCompliantCount) {
    risks.push(
      `${options.nonCompliantCount} exigence(s) marquée(s) « non conforme » dans la grille de conformité.`,
    );
  }
  if (risks.length === 0) {
    risks.push('Aucun risque majeur identifié par le scoring — rester vigilant sur les clauses contractuelles.');
  }

  const actions: string[] = weaknesses
    .map((c) => ACTION_BY_CRITERION[c.id])
    .filter((a): a is string => Boolean(a));
  if (recommendation !== 'ne_pas_repondre') {
    actions.push('Formaliser la décision en comité et affecter les tâches de production dans l\'onglet Tâches.');
  } else {
    actions.push('Si la décision no-go est confirmée, passer le dossier au statut « Abandonné » pour libérer les équipes.');
  }

  return {
    computedAt: nowIso(),
    globalScore,
    recommendation,
    reasons: [...new Set(reasons)],
    risks: [...new Set(risks)],
    actions: [...new Set(actions)],
  };
}
