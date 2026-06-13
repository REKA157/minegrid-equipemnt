import { describe, it, expect } from 'vitest';
import { computeOverallGrade } from './inspectionGrade';

describe('computeOverallGrade', () => {
  it('sans aucune note = données insuffisantes (null, pas de façade)', () => {
    const r = computeOverallGrade({});
    expect(r.grade).toBeNull();
    expect(r.score).toBeNull();
    expect(r.assessed).toBe(0);
  });

  it('machine en bon état = grade A', () => {
    const r = computeOverallGrade({
      engine: 'A', structure: 'A', hydraulics: 'A', undercarriage: 'B', electrical: 'B',
    });
    expect(r.grade).toBe('A');
    expect(r.assessed).toBe(5);
  });

  it('moteur en F déclasse toute la machine en F', () => {
    const r = computeOverallGrade({ engine: 'F', structure: 'A', hydraulics: 'A' });
    expect(r.grade).toBe('F');
    expect(r.score).toBe(0);
  });

  it('électrique en F (non critique) ne déclasse pas tout', () => {
    const r = computeOverallGrade({ engine: 'A', structure: 'A', electrical: 'F' });
    expect(r.grade).not.toBe('F');
  });

  it('pondère les composants critiques', () => {
    const r = computeOverallGrade({ engine: 'C', structure: 'C', electrical: 'A' });
    // engine+structure (poids 3+3) dominent => proche de C, pas remonté à A par l'électrique
    expect(r.grade).toBe('C');
  });
});
