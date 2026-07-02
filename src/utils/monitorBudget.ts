// =====================================================================
// Parsing robuste des budgets projet du Global Monitor.
// Le champ `budget_usd` DEVRAIT être un nombre (USD normalisé par le connecteur),
// mais en pratique certaines lignes contiennent null / "N/A" / des chaînes
// ("350M USD", "1 200 000 MAD"). Sommer ces valeurs avec `|| 0` produisait
// « Budget total $NaNM ». On parse donc défensivement et on EXCLUT l'invalide.
// =====================================================================

/**
 * Convertit une valeur de budget hétérogène en nombre USD exploitable.
 * Retourne `null` si la valeur n'est pas un montant positif interprétable
 * (null, undefined, "N/A", chaîne sans chiffre, 0, négatif, NaN…).
 * Gère les suffixes k / M / Md-B (millier / million / milliard) et les
 * séparateurs de milliers (espaces, virgules).
 *
 * NB : la magnitude est traitée comme USD (le champ est `budget_usd`). Une valeur
 * libellée dans une autre devise est une anomalie de données amont ; on n'invente
 * pas de conversion ici.
 */
export function parseBudgetUsd(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;

  const s = value.trim().toLowerCase();
  if (!s || !/\d/.test(s)) return null; // "N/A", "", "inconnu"…

  let mult = 1;
  if (/\d\s*(md|bn|b)\b/.test(s) || /\b(milliard|billion)\b/.test(s)) mult = 1e9;
  else if (/\d\s*m\b/.test(s) || /\bmillion/.test(s)) mult = 1e6;
  else if (/\d\s*k\b/.test(s) || /\bmillier/.test(s)) mult = 1e3;

  const numMatch = s.match(/\d[\d\s.,]*/);
  if (!numMatch) return null;
  // Espaces et virgules = séparateurs de milliers ; le point reste décimal.
  const cleaned = numMatch[0].replace(/[\s,]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;

  return n * mult;
}

export interface BudgetSummary {
  /** Somme USD des budgets exploitables uniquement. Jamais NaN. */
  totalUsd: number;
  /** Nombre de projets avec un budget exploitable. */
  budgetedCount: number;
  /** Nombre de projets sans budget exploitable (exclus du total). */
  withoutBudgetCount: number;
}

/** Agrège les budgets d'une liste de projets sans jamais produire NaN. */
export function summarizeBudgets(projects: ReadonlyArray<{ budget_usd?: unknown }>): BudgetSummary {
  let totalUsd = 0;
  let budgetedCount = 0;
  let withoutBudgetCount = 0;
  for (const p of projects) {
    const b = parseBudgetUsd(p?.budget_usd);
    if (b == null) {
      withoutBudgetCount += 1;
    } else {
      totalUsd += b;
      budgetedCount += 1;
    }
  }
  return { totalUsd, budgetedCount, withoutBudgetCount };
}
