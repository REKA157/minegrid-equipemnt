/**
 * Référentiel d'exigences — helpers métier.
 *
 * Construit les exigences à partir de l'analyse du DCE (exigences
 * techniques, clauses contractuelles, points bloquants, pièces à fournir),
 * calcule les statistiques de couverture et fournit les codes courts
 * (TE-001, CO-002…) utilisés dans la matrice de conformité et la réponse
 * point par point.
 */

import type {
  DceAnalysisResult,
  RequirementCoverage,
  TenderRequirement,
} from '../types';
import { uid } from '../types';

const CATEGORY_PREFIX: Record<string, string> = {
  Technique: 'TE',
  Administratif: 'AD',
  Financier: 'FI',
  'Délais / planning': 'DL',
  Qualité: 'QA',
  'Sécurité / HSE': 'SE',
  Environnement: 'EN',
  Contractuel: 'CO',
  'Pièces à fournir': 'PI',
  'Point bloquant': 'BL',
  Éligibilité: 'EL',
  Autre: 'EX',
};

/**
 * Clé de comparaison pour la déduplication : insensible à la casse, aux
 * espaces multiples, aux variantes de tirets et à la ponctuation finale.
 * Évite les quasi-doublons (« … centrale agréée. » vs « … centrale agréée »).
 */
export function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,!]+$/g, '');
}

/** Prochain code libre pour une catégorie (TE-001, TE-002…). */
export function nextRequirementCode(
  existing: TenderRequirement[],
  category: string,
): string {
  const prefix = CATEGORY_PREFIX[category] ?? 'EX';
  const used = existing
    .filter((r) => r.code.startsWith(`${prefix}-`))
    .map((r) => parseInt(r.code.split('-')[1] ?? '0', 10))
    .filter((n) => Number.isFinite(n));
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

export function makeRequirement(
  existing: TenderRequirement[],
  partial: Partial<TenderRequirement> & { text: string; category: string },
): TenderRequirement {
  return {
    id: uid('req'),
    code: partial.code ?? nextRequirementCode(existing, partial.category),
    text: partial.text,
    source: partial.source ?? '',
    category: partial.category,
    level: partial.level ?? 'important',
    coverage: partial.coverage ?? 'a_traiter',
    response: partial.response ?? '',
    responsible: partial.responsible ?? '',
    evidence: partial.evidence ?? '',
    comment: partial.comment ?? '',
  };
}

/**
 * Transforme les résultats d'une analyse DCE en exigences structurées.
 * Ne crée pas de doublon avec les exigences déjà présentes (comparaison
 * insensible à la casse sur le texte).
 */
export function deriveRequirementsFromAnalysis(
  analysis: DceAnalysisResult,
  existing: TenderRequirement[],
): TenderRequirement[] {
  const known = new Set(existing.map((r) => normalizeKey(r.text)));
  const created: TenderRequirement[] = [];

  const push = (partial: Partial<TenderRequirement> & { text: string; category: string }) => {
    const key = normalizeKey(partial.text);
    if (!key || known.has(key)) return;
    known.add(key);
    const req = makeRequirement([...existing, ...created], partial);
    created.push(req);
  };

  analysis.blockingPoints.forEach((text) =>
    push({ text, category: 'Point bloquant', level: 'imperatif', source: 'Analyse DCE — point bloquant' }),
  );
  analysis.technicalRequirements.forEach((text) =>
    push({ text, category: 'Technique', level: 'imperatif', source: 'CCTP (analyse DCE)' }),
  );
  analysis.keyClauses.forEach((clause) =>
    push({
      text: `${clause.title} : ${clause.excerpt}`,
      category: 'Contractuel',
      level: clause.risk === 'eleve' ? 'imperatif' : 'important',
      source: 'CCAP (analyse DCE)',
    }),
  );
  analysis.requiredDocuments.forEach((docReq) =>
    push({
      text: `Fournir : ${docReq.label}`,
      category: 'Pièces à fournir',
      level: 'imperatif',
      source: 'RC (analyse DCE)',
    }),
  );

  return created;
}

// ---------------------------------------------------------------------------
// Statistiques de couverture
// ---------------------------------------------------------------------------

export interface CoverageStats {
  total: number;
  byCoverage: Record<RequirementCoverage, number>;
  /** Impératifs non conformes ou sans réponse = risque de rejet. */
  criticalGaps: number;
  /** % d'exigences avec une réponse rédigée. */
  responseRate: number;
}

export function computeCoverageStats(requirements: TenderRequirement[]): CoverageStats {
  const byCoverage: Record<RequirementCoverage, number> = {
    a_traiter: 0,
    conforme: 0,
    partiel: 0,
    non_conforme: 0,
  };
  let answered = 0;
  let criticalGaps = 0;
  requirements.forEach((r) => {
    byCoverage[r.coverage] += 1;
    if (r.response.trim()) answered += 1;
    if (r.level === 'imperatif' && (r.coverage === 'non_conforme' || r.coverage === 'a_traiter')) {
      criticalGaps += 1;
    }
  });
  return {
    total: requirements.length,
    byCoverage,
    criticalGaps,
    responseRate: requirements.length === 0 ? 0 : Math.round((answered / requirements.length) * 100),
  };
}
