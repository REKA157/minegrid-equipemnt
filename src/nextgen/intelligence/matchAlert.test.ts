import { describe, it, expect } from 'vitest';
import { matchesAlert, type ProjectLite, type AlertQuery } from './matchAlert';

const project: ProjectLite = {
  country: 'Sénégal',
  sector: 'mining',
  budget: 5_000_000,
  title: 'Nouvelle mine d’or — besoin de pelles et chargeuses',
  description: 'Terrassement et concassage',
};

describe('matchesAlert', () => {
  it('correspond quand tous les critères sont satisfaits', () => {
    const q: AlertQuery = { country: 'sénégal', sector: 'mining', minBudget: 1_000_000, equipmentTypes: ['pelle'] };
    expect(matchesAlert(project, q).matches).toBe(true);
  });

  it('rejette si le pays diffère', () => {
    expect(matchesAlert(project, { country: 'Mali' }).matches).toBe(false);
  });

  it('rejette si le budget est insuffisant', () => {
    expect(matchesAlert(project, { minBudget: 10_000_000 }).matches).toBe(false);
  });

  it('rejette si aucun équipement ciblé n’est mentionné', () => {
    expect(matchesAlert(project, { equipmentTypes: ['grue', 'foreuse'] }).matches).toBe(false);
  });

  it('alerte vide correspond à tout', () => {
    expect(matchesAlert(project, {}).matches).toBe(true);
  });
});
