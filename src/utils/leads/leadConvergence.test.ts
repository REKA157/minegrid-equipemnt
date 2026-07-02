import { describe, it, expect } from 'vitest';
import {
  classifyEntryEngine,
  scoreLead,
  prioritizeLeads,
  engineBreakdown,
  type LeadInput,
} from './leadConvergence';

const NOW = '2026-06-15T00:00:00Z';

describe('leadConvergence — typologie (convergence des 3 moteurs)', () => {
  it('classe la source vers son moteur d entrée', () => {
    expect(classifyEntryEngine('quote_request')).toBe('marketplace');
    expect(classifyEntryEngine('message')).toBe('marketplace');
    expect(classifyEntryEngine('monitor')).toBe('monitor');
    expect(classifyEntryEngine('besoin_pro')).toBe('pro_demand');
    expect(classifyEntryEngine(null)).toBe('unknown');
  });
});

describe('leadConvergence — scoring (données réelles, anti-façade)', () => {
  it('lead terminal (Conclu/Perdu) -> null (pas une opportunité)', () => {
    expect(scoreLead({ id: '1', stage: 'Conclu' }, NOW)).toBeNull();
    expect(scoreLead({ id: '2', stage: 'Perdu' }, NOW)).toBeNull();
  });

  it('stage chaud sans dossier -> score élevé + action « Créer le dossier »', () => {
    const s = scoreLead(
      {
        id: '3',
        title: 'Pelle 320D',
        stage: 'Devis',
        value: 500000,
        probability: 80,
        last_contact: NOW,
        source: 'quote_request',
        transaction_case_id: null,
      },
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.score).toBeGreaterThanOrEqual(70);
    expect(s!.priority).toBe('urgent');
    expect(s!.action).toBe('Créer le dossier transaction');
    expect(s!.engine).toBe('marketplace');
    expect(s!.hasDossier).toBe(false);
  });

  it('lead figé (vieux dernier contact) -> action « Relancer »', () => {
    const s = scoreLead(
      { id: '4', stage: 'Qualification', last_contact: '2026-05-20T00:00:00Z', transaction_case_id: 'case-x' },
      NOW,
    );
    expect(s!.action).toContain('Relancer');
  });

  it('lead avec dossier déjà créé -> action « Faire avancer le dossier »', () => {
    const s = scoreLead(
      { id: '5', stage: 'Qualification', last_contact: NOW, transaction_case_id: 'case-y' },
      NOW,
    );
    expect(s!.action).toBe('Faire avancer le dossier');
    expect(s!.hasDossier).toBe(true);
  });

  it('score borné 0..100, champs absents -> contribution neutre (jamais inventée)', () => {
    const s = scoreLead({ id: '6', stage: 'Prospection' }, NOW);
    expect(s!.score).toBeGreaterThanOrEqual(0);
    expect(s!.score).toBeLessThanOrEqual(100);
  });
});

describe('leadConvergence — priorisation & convergence', () => {
  const leads: LeadInput[] = [
    { id: 'a', stage: 'Conclu' }, // terminal -> exclu
    { id: 'b', stage: 'Devis', value: 500000, probability: 90, last_contact: NOW, source: 'message' },
    { id: 'c', stage: 'Prospection', last_contact: NOW, source: 'monitor' },
  ];

  it('exclut les terminaux et trie du plus chaud au plus froid', () => {
    const out = prioritizeLeads(leads, NOW);
    expect(out.map((s) => s.id)).toEqual(['b', 'c']); // a exclu, b > c
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it('engineBreakdown matérialise la convergence par moteur', () => {
    const out = prioritizeLeads(leads, NOW);
    const b = engineBreakdown(out);
    expect(b.marketplace).toBe(1); // 'b' (message)
    expect(b.monitor).toBe(1); // 'c' (monitor)
    expect(b.pro_demand).toBe(0);
  });

  it('liste vide -> aucune opportunité (anti-façade)', () => {
    expect(prioritizeLeads([], NOW)).toHaveLength(0);
  });
});
