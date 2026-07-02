import { describe, it, expect } from 'vitest';
import { deriveStockAction, type MachineLite, type MachineSignals } from './stockActions';

const NOW = Date.parse('2026-06-16T00:00:00Z');
const m: MachineLite = { id: 'm1', title: 'CAT 320', category: 'Pelle' };
const sig = (over: Partial<MachineSignals>): MachineSignals => ({
  status: 'available',
  views: 0,
  recentViews: 0,
  quotes: 0,
  hasCase: false,
  createdMs: null,
  ...over,
});

describe('deriveStockAction (PUR) — actions commerciales sur le stock', () => {
  it('machine non disponible (vendue) -> aucune action', () => {
    expect(deriveStockAction(m, sig({ status: 'sold', quotes: 3 }), NOW)).toBeNull();
  });

  it('devis reçu sans dossier -> créer le dossier (high)', () => {
    const a = deriveStockAction(m, sig({ quotes: 2, hasCase: false }), NOW);
    expect(a?.action).toBe('Créer le dossier transaction');
    expect(a?.priority).toBe('high');
    expect(a?.href).toBe('#machines/m1');
  });

  it('beaucoup vue sans devis -> améliorer annonce / ajuster prix (high)', () => {
    const a = deriveStockAction(m, sig({ views: 15, recentViews: 3, quotes: 0 }), NOW);
    expect(a?.action).toMatch(/Améliorer l'annonce/);
    expect(a?.reason).toMatch(/15 vues/);
  });

  it('annonce dormante (aucune vue récente, ancienne) -> booster la visibilité (medium)', () => {
    const created = NOW - 60 * 86400000;
    const a = deriveStockAction(m, sig({ views: 2, recentViews: 0, createdMs: created }), NOW);
    expect(a?.action).toBe('Booster la visibilité');
    expect(a?.priority).toBe('medium');
  });

  it('faible visibilité (non dormante) -> promouvoir (low)', () => {
    const a = deriveStockAction(m, sig({ views: 3, recentViews: 3 }), NOW);
    expect(a?.action).toBe("Promouvoir l'annonce");
    expect(a?.priority).toBe('low');
  });

  it('machine saine (vues récentes, devis déjà en dossier) -> aucune action', () => {
    const a = deriveStockAction(m, sig({ views: 7, recentViews: 7, quotes: 2, hasCase: true }), NOW);
    expect(a).toBeNull();
  });
});
