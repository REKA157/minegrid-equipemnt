import { describe, it, expect } from 'vitest';
import { quoteEstimate } from './quoteEstimate';

describe('quoteEstimate', () => {
  it('poids invalide = indisponible', () => {
    const r = quoteEstimate({ mode: 'sea', weightKg: 0 });
    expect(r.method).toBe('unavailable');
    expect(r.price).toBeNull();
  });

  it('route sans distance = indisponible', () => {
    const r = quoteEstimate({ mode: 'road', weightKg: 20000 });
    expect(r.method).toBe('unavailable');
  });

  it('maritime : prix au tonnage + ETA fixe', () => {
    const r = quoteEstimate({ mode: 'sea', weightKg: 20000 }); // 20 t
    expect(r.method).toBe('tariff_grid');
    expect(r.price).toBe(800 + 90 * 20); // base + 90€/t
    expect(r.etaDays).toBe(21);
  });

  it('route : prix au tonne-km + ETA calculée', () => {
    const r = quoteEstimate({ mode: 'road', weightKg: 10000, distanceKm: 1000 });
    expect(r.method).toBe('tariff_grid');
    expect(r.price).toBe(Math.round(300 + 0.12 * 10 * 1000)); // base + 0.12€/t/km
    expect(r.etaDays).toBe(2); // 1000/500
  });
});
