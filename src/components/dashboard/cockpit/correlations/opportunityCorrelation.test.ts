import { describe, it, expect } from 'vitest';
import { buildOpportunitySignals } from './opportunityCorrelation';
import type { LeadInput } from '../../../../utils/leads/leadConvergence';

const NOW = '2026-06-15T00:00:00Z';

describe('opportunityCorrelation — anti-façade & action', () => {
  it('liste vide -> aucun signal', () => {
    expect(buildOpportunitySignals([], NOW)).toEqual([]);
  });

  it('tous les leads « normal » (aucune opportunité chaude) -> aucune carte', () => {
    const leads: LeadInput[] = [
      { id: 'p1', stage: 'Prospection', last_contact: NOW, source: 'monitor' }, // score bas -> normal
      { id: 'p2', stage: 'Prospection', value: 0, probability: 0, last_contact: NOW, source: 'message' },
    ];
    expect(buildOpportunitySignals(leads, NOW)).toEqual([]);
  });

  it('un lead chaud (Devis, sans dossier) -> 1 signal actionnable vers #leads', () => {
    const leads: LeadInput[] = [
      { id: 'hot', stage: 'Devis', value: 500000, probability: 90, last_contact: NOW, source: 'quote_request' },
    ];
    const sig = buildOpportunitySignals(leads, NOW);
    expect(sig).toHaveLength(1);
    expect(sig[0].id).toBe('opp:lead-convergence');
    expect(sig[0].href).toBe('#leads');
    expect(sig[0].tone).toBe('urgent'); // score >= 70
    expect(sig[0].label).toContain('Créer le dossier');
  });

  it('détail = répartition par moteur (convergence honnête : marketplace réel aujourd’hui)', () => {
    const leads: LeadInput[] = [
      { id: 'm1', stage: 'Devis', value: 500000, probability: 90, last_contact: NOW, source: 'message' },
      { id: 'm2', stage: 'Proposition', value: 300000, probability: 80, last_contact: NOW, source: 'monitor' },
    ];
    const sig = buildOpportunitySignals(leads, NOW);
    expect(sig).toHaveLength(1);
    expect(sig[0].detail).toContain('1 annonce');
    expect(sig[0].detail).toContain('1 monitor');
  });
});
