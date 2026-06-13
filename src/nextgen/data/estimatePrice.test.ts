import { describe, it, expect } from 'vitest';
import { estimatePrice, quantile } from './estimatePrice';

describe('estimatePrice', () => {
  it('moins de 3 observations = donnée indisponible (anti-façade)', () => {
    const r = estimatePrice([{ price: 100000 }, { price: 120000 }]);
    expect(r.method).toBe('insufficient_data');
    expect(r.estimate).toBeNull();
    expect(r.n).toBe(2);
  });

  it('ignore les prix invalides (0, négatifs, NaN)', () => {
    const r = estimatePrice([{ price: 0 }, { price: -5 }, { price: 100000 }, { price: NaN }]);
    expect(r.method).toBe('insufficient_data'); // une seule valeur valide
  });

  it('calcule médiane et IQR sur données suffisantes', () => {
    const obs = [100, 110, 120, 130, 140].map((p) => ({ price: p * 1000 }));
    const r = estimatePrice(obs);
    expect(r.method).toBe('median_iqr');
    expect(r.estimate).toBe(120000);
    expect(r.low).toBe(110000);
    expect(r.high).toBe(130000);
    expect(r.n).toBe(5);
  });

  it('quantile interpole correctement', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });
});
