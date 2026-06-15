import { describe, it, expect } from 'vitest';
import { ROLE_CONFIG, categorizeEvent } from './partnerEvents';
import {
  computePartnerKpis,
  computeAcceptanceKpis,
  type ChainAssignment,
} from './partnerKpis';
import { computePartnerScore } from './partnerScore';
import { rankPartners, bestPartner, type PartnerCandidate } from './partnerMatching';

const MECH = ROLE_CONFIG.mechanic;

describe('partnerEvents — normalisation', () => {
  it('mappe les event_type réels vers des catégories KPI', () => {
    expect(categorizeEvent('inspection.requested')).toBe('step_requested');
    expect(categorizeEvent('transport.requested')).toBe('step_requested');
    expect(categorizeEvent('participant.assigned')).toBe('assigned');
    expect(categorizeEvent('participant.accepted')).toBe('accepted');
    expect(categorizeEvent('participant.declined')).toBe('declined');
    expect(categorizeEvent('participant.revoked')).toBe('revoked');
    expect(categorizeEvent('truc.inconnu')).toBe('other');
    expect(categorizeEvent(null)).toBe('other');
  });
});

describe('partnerKpis — exécution (données réelles uniquement)', () => {
  it('aucune ligne -> tout à zéro / null (anti-façade)', () => {
    const k = computePartnerKpis([], MECH);
    expect(k).toEqual({
      volume: 0,
      open: 0,
      completedSuccess: 0,
      completionRate: 0,
      avgProcessingDays: null,
      lateRate: null,
    });
  });

  it('calcule volume/open/complétion/délai/retard depuis de vraies lignes', () => {
    const rows: ChainAssignment[] = [
      { status: 'assigned', createdAt: '2026-06-01T00:00:00Z', completedAt: null, dueAt: null },
      // complété en 2j, en retard (due 06-02, fini 06-03)
      { status: 'completed', createdAt: '2026-06-01T00:00:00Z', completedAt: '2026-06-03T00:00:00Z', dueAt: '2026-06-02T00:00:00Z' },
      // complété en 0.5j, à l'heure (due 06-05)
      { status: 'completed', createdAt: '2026-06-01T00:00:00Z', completedAt: '2026-06-01T12:00:00Z', dueAt: '2026-06-05T00:00:00Z' },
      { status: 'cancelled', createdAt: '2026-06-01T00:00:00Z', completedAt: '2026-06-02T00:00:00Z', dueAt: null },
    ];
    const k = computePartnerKpis(rows, MECH);
    expect(k.volume).toBe(4);
    expect(k.open).toBe(1);
    expect(k.completedSuccess).toBe(2);
    expect(k.completionRate).toBeCloseTo(2 / 3, 5); // 2 succès / 3 terminaux
    expect(k.avgProcessingDays).toBeCloseTo(1.25, 5); // (2 + 0.5)/2
    expect(k.lateRate).toBeCloseTo(0.5, 5); // 1 retard / 2 avec échéance
  });

  it('rôle sans échéance -> lateRate null (jamais inventé)', () => {
    const rows: ChainAssignment[] = [
      { status: 'funded', createdAt: '2026-06-01T00:00:00Z', completedAt: '2026-06-02T00:00:00Z', dueAt: '2026-06-01T00:00:00Z' },
    ];
    const k = computePartnerKpis(rows, ROLE_CONFIG.broker); // hasDeadline=false
    expect(k.lateRate).toBeNull();
  });
});

describe('partnerKpis — acceptation', () => {
  it('calcule taux et délai moyen d acceptation', () => {
    const a = computeAcceptanceKpis([
      { invitedAt: '2026-06-01T00:00:00Z', acceptedAt: '2026-06-01T12:00:00Z', revokedAt: null }, // 12h
      { invitedAt: '2026-06-01T00:00:00Z', acceptedAt: null, revokedAt: '2026-06-02T00:00:00Z' }, // refus
      { invitedAt: '2026-06-01T00:00:00Z', acceptedAt: '2026-06-01T00:00:00Z', revokedAt: null }, // 0h
    ]);
    expect(a.invited).toBe(3);
    expect(a.accepted).toBe(2);
    expect(a.declinedOrRevoked).toBe(1);
    expect(a.acceptanceRate).toBeCloseTo(2 / 3, 5);
    expect(a.avgAcceptanceHours).toBeCloseTo(6, 5); // (12 + 0)/2
  });

  it('aucune invitation -> taux 0, délai null', () => {
    const a = computeAcceptanceKpis([]);
    expect(a.acceptanceRate).toBe(0);
    expect(a.avgAcceptanceHours).toBeNull();
  });
});

describe('partnerScore — n agrège que le mesurable (anti-façade)', () => {
  it('aucune donnée -> hasData false, score null', () => {
    const s = computePartnerScore(
      { volume: 0, open: 0, completedSuccess: 0, completionRate: 0, avgProcessingDays: null, lateRate: null },
      { invited: 0, accepted: 0, declinedOrRevoked: 0, acceptanceRate: 0, avgAcceptanceHours: null },
    );
    expect(s.hasData).toBe(false);
    expect(s.score).toBeNull();
    expect(s.components).toHaveLength(0);
  });

  it('score 0..100 calculé sur les seules composantes mesurées', () => {
    const s = computePartnerScore(
      { volume: 5, open: 1, completedSuccess: 4, completionRate: 1, avgProcessingDays: 0, lateRate: 0 },
      { invited: 4, accepted: 4, declinedOrRevoked: 0, acceptanceRate: 1, avgAcceptanceHours: 0 },
    );
    expect(s.hasData).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    // parfait partout -> proche de 100 (volume 5/10 = 0.5 tire légèrement vers le bas)
    expect(s.score!).toBeGreaterThan(85);
    // une métrique absente (pas de délai) n'apparaît pas dans le breakdown
    const keys = s.components.map((c) => c.key);
    expect(keys).toContain('fiabilite');
    expect(keys).toContain('volume');
  });
});

describe('partnerMatching — classe les vrais scores, écarte le vide', () => {
  const cand = (id: string, score: number | null): PartnerCandidate => ({
    partnerId: id,
    score: { hasData: score != null, score, components: score != null ? [{ key: 'volume', label: 'v', value: 1, weight: 0.1 }] : [] },
  });

  it('trie par score décroissant et exclut les candidats sans donnée', () => {
    const ranked = rankPartners([cand('a', 70), cand('b', null), cand('c', 90)]);
    expect(ranked.map((c) => c.partnerId)).toEqual(['c', 'a']);
  });

  it('bestPartner null si aucun candidat avec donnée réelle', () => {
    expect(bestPartner([cand('x', null)])).toBeNull();
    expect(bestPartner([])).toBeNull();
  });
});
