import { describe, it, expect } from 'vitest';
import { parseBudgetUsd, summarizeBudgets } from './monitorBudget';

describe('parseBudgetUsd', () => {
  it('rejette null / undefined / vide', () => {
    expect(parseBudgetUsd(null)).toBeNull();
    expect(parseBudgetUsd(undefined)).toBeNull();
    expect(parseBudgetUsd('')).toBeNull();
  });

  it('rejette les chaînes non numériques ("N/A", "inconnu")', () => {
    expect(parseBudgetUsd('N/A')).toBeNull();
    expect(parseBudgetUsd('inconnu')).toBeNull();
  });

  it('rejette 0 et négatif (pas de budget exploitable)', () => {
    expect(parseBudgetUsd(0)).toBeNull();
    expect(parseBudgetUsd(-500)).toBeNull();
    expect(parseBudgetUsd(Number.NaN)).toBeNull();
  });

  it('accepte un nombre simple', () => {
    expect(parseBudgetUsd(5_000_000)).toBe(5_000_000);
  });

  it('parse un suffixe million ("350M USD")', () => {
    expect(parseBudgetUsd('350M USD')).toBe(350_000_000);
    expect(parseBudgetUsd('1.2 million')).toBe(1_200_000);
  });

  it('parse les séparateurs de milliers ("1 200 000 MAD")', () => {
    // magnitude traitée comme USD (champ budget_usd) — pas de conversion inventée
    expect(parseBudgetUsd('1 200 000 MAD')).toBe(1_200_000);
    expect(parseBudgetUsd('1,200,000')).toBe(1_200_000);
  });

  it('parse milliard / k', () => {
    expect(parseBudgetUsd('2 Md USD')).toBe(2_000_000_000);
    expect(parseBudgetUsd('800k')).toBe(800_000);
  });
});

describe('summarizeBudgets', () => {
  it('somme les valides et compte les invalides, jamais NaN', () => {
    const projects = [
      { budget_usd: 5_000_000 },
      { budget_usd: '350M USD' },
      { budget_usd: null },
      { budget_usd: 'N/A' },
      { budget_usd: '1 200 000 MAD' },
      {},
    ];
    const s = summarizeBudgets(projects);
    expect(s.totalUsd).toBe(5_000_000 + 350_000_000 + 1_200_000);
    expect(Number.isNaN(s.totalUsd)).toBe(false);
    expect(s.budgetedCount).toBe(3);
    expect(s.withoutBudgetCount).toBe(3);
  });

  it('liste vide -> total 0', () => {
    expect(summarizeBudgets([])).toEqual({ totalUsd: 0, budgetedCount: 0, withoutBudgetCount: 0 });
  });
});
