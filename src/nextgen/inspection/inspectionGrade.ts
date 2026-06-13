// MineGrid Inspection — calcul du grade global d'une machine à partir des
// notes par composant. Pure et testable. La CERTIFICATION (écriture certified=true)
// reste serveur (service_role) ; cette fonction calcule le grade affiché.

export type ComponentGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface InspectionFindings {
  engine?: ComponentGrade;
  hydraulics?: ComponentGrade;
  undercarriage?: ComponentGrade;
  electrical?: ComponentGrade;
  structure?: ComponentGrade;
}

const GRADE_POINTS: Record<ComponentGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

// Composants critiques (sécurité/valeur) pondérés plus fort.
const WEIGHTS: Record<keyof InspectionFindings, number> = {
  engine: 3,
  structure: 3,
  hydraulics: 2,
  undercarriage: 2,
  electrical: 1,
};

export interface OverallGrade {
  grade: ComponentGrade | null; // null = données insuffisantes (anti-façade)
  score: number | null; // 0-4 pondéré
  assessed: number; // nb de composants évalués
}

export function computeOverallGrade(findings: InspectionFindings): OverallGrade {
  const entries = Object.entries(findings).filter(([, g]) => !!g) as Array<[keyof InspectionFindings, ComponentGrade]>;
  if (entries.length === 0) {
    return { grade: null, score: null, assessed: 0 };
  }

  // Un composant critique en 'F' déclasse l'ensemble en F (machine non fiable).
  for (const [key, g] of entries) {
    if (g === 'F' && (key === 'engine' || key === 'structure')) {
      return { grade: 'F', score: 0, assessed: entries.length };
    }
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, g] of entries) {
    const w = WEIGHTS[key];
    weighted += GRADE_POINTS[g] * w;
    totalWeight += w;
  }
  const score = weighted / totalWeight; // 0-4
  return { grade: scoreToGrade(score), score: round2(score), assessed: entries.length };
}

function scoreToGrade(score: number): ComponentGrade {
  if (score >= 3.5) return 'A';
  if (score >= 2.5) return 'B';
  if (score >= 1.5) return 'C';
  if (score >= 0.5) return 'D';
  return 'F';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
