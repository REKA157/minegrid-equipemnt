import { describe, it, expect } from 'vitest';
import { matchProjectsToStock } from './marketProjectInsights';

describe('matchProjectsToStock (PUR) — reco #7 dormante mais correcte', () => {
  it('projet minier + Pelle en stock (même pays) -> match', () => {
    const out = matchProjectsToStock(
      [{ id: 'p1', title: 'Mine de cuivre', sector: 'mining', country: 'Maroc' }],
      [{ id: 'm1', title: 'Pelle CAT 320', category: 'Pelle hydraulique', country: 'Maroc' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ projectId: 'p1', machineId: 'm1', projectTitle: 'Mine de cuivre' });
  });

  it('secteur non mappé -> aucun match (pas de match inventé)', () => {
    const out = matchProjectsToStock(
      [{ id: 'p1', sector: 'agriculture', country: 'Maroc' }],
      [{ id: 'm1', title: 'Pelle', category: 'Pelle' }],
    );
    expect(out).toEqual([]);
  });

  it('pays connus et différents -> pas de match', () => {
    const out = matchProjectsToStock(
      [{ id: 'p1', sector: 'mining', country: 'Mali' }],
      [{ id: 'm1', title: 'Pelle', category: 'Pelle', country: 'Maroc' }],
    );
    expect(out).toEqual([]);
  });

  it('aucun engin compatible -> pas de match', () => {
    const out = matchProjectsToStock(
      [{ id: 'p1', sector: 'mining' }],
      [{ id: 'm1', title: 'Camionnette', category: 'Utilitaire' }],
    );
    expect(out).toEqual([]);
  });

  it('aucun projet (table dormante) -> []', () => {
    expect(matchProjectsToStock([], [{ id: 'm1', title: 'Pelle', category: 'Pelle' }])).toEqual([]);
  });
});
