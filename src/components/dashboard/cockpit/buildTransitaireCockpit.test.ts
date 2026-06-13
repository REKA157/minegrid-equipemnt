import { describe, it, expect } from 'vitest';
import {
  buildTransitaireCockpit,
  type TransitaireCockpitInput,
} from './buildTransitaireCockpit';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();

const customs = (
  over: Partial<TransitaireCockpitInput['customs']> = {},
): TransitaireCockpitInput['customs'] => ({
  openCount: 0,
  inProgress: 0,
  blocked: 0,
  delayed: 0,
  totalValueOpen: 0,
  totalDeclarations: 0,
  liquidated: 0,
  ...over,
});

const base: TransitaireCockpitInput = {
  customs: customs(),
  containers: [],
  documents: [],
};

describe('buildTransitaireCockpit', () => {
  it('headline = blocked + delayed avec unité déclarations et valeur ouverte en hint', () => {
    const c = buildTransitaireCockpit(
      { ...base, customs: customs({ blocked: 2, delayed: 3, openCount: 7, totalValueOpen: 1500000 }) },
      NOW,
    );
    expect(c.revenueValue).toBe(5);
    expect(c.revenueUnit).toBe('déclarations');
    expect(c.revenueAvailable).toBe(true);
    expect(c.revenueHint).toContain('7 déclaration');
    expect(c.revenueHint).toContain('MAD');
  });

  it('états vides honnêtes : aucune carte sans donnée', () => {
    const c = buildTransitaireCockpit(base, NOW);
    expect(c.revenueValue).toBe(0);
    expect(c.priorities).toHaveLength(0);
    expect(c.risks).toHaveLength(0);
    expect(c.opportunities).toHaveLength(0);
  });

  it('priorités : déclarations bloquées et en retard', () => {
    const c = buildTransitaireCockpit(
      { ...base, customs: customs({ blocked: 1, delayed: 2, openCount: 3 }) },
      NOW,
    );
    expect(c.priorities.some((p) => p.id === 'pri:decl-bloquee' && p.tone === 'urgent')).toBe(true);
    expect(c.priorities.some((p) => p.id === 'pri:decl-en-retard' && p.tone === 'warn')).toBe(true);
  });

  it('priorités : conteneurs en retard/douane et documents rejetés ou urgents en attente', () => {
    const c = buildTransitaireCockpit(
      {
        ...base,
        containers: [
          { id: 'c1', container_number: 'A', status: 'Retard', lat: null, lng: null, eta: null },
          { id: 'c2', container_number: 'B', status: 'Douane', lat: null, lng: null, eta: null },
          { id: 'c3', container_number: 'C', status: 'En mer', lat: null, lng: null, eta: null },
        ],
        documents: [
          { id: 'd1', title: 'BL', status: 'Rejeté', priority: 'low' },
          { id: 'd2', title: 'Facture', status: 'En attente', priority: 'high' },
          { id: 'd3', title: 'Autre', status: 'En attente', priority: 'low' },
        ],
      },
      NOW,
    );
    const cont = c.priorities.find((p) => p.id === 'pri:container-retard-douane');
    expect(cont?.label).toContain('2 conteneur');
    const docs = c.priorities.find((p) => p.id === 'pri:doc-rejete-urgent');
    expect(docs?.label).toContain('2 document');
    // le doc 'En attente' priorité low ne doit PAS compter
  });

  it('risque : déclarations en cours / contrôle douanier quand inProgress > 0', () => {
    const c = buildTransitaireCockpit(
      { ...base, customs: customs({ inProgress: 4, openCount: 4 }) },
      NOW,
    );
    expect(c.risks.some((r) => r.id === 'risk:decl-en-controle-scanner')).toBe(true);
  });

  it('opportunités : déclarations à faire avancer + conteneur à quai ETA imminente', () => {
    const soon = new Date(NOW + 2 * 86_400_000).toISOString();
    const far = new Date(NOW + 30 * 86_400_000).toISOString();
    const c = buildTransitaireCockpit(
      {
        ...base,
        customs: customs({ openCount: 5, blocked: 1, delayed: 1 }), // toAdvance = 3
        containers: [
          { id: 'c1', container_number: 'A', status: 'À quai', lat: null, lng: null, eta: soon },
          { id: 'c2', container_number: 'B', status: 'À quai', lat: null, lng: null, eta: far },
          { id: 'c3', container_number: 'C', status: 'En mer', lat: null, lng: null, eta: soon },
        ],
      },
      NOW,
    );
    const adv = c.opportunities.find((o) => o.id === 'opp:decl-a-soumettre');
    expect(adv?.label).toContain('3 déclaration');
    const dock = c.opportunities.find((o) => o.id === 'opp:container-a-quai-imminent');
    expect(dock?.label).toContain('1 conteneur'); // seul le c1 (À quai + ETA <= 3j)
  });
});
