import { describe, it, expect } from 'vitest';
import {
  classifyRole,
  prospectAngle,
  prospectKindOfLead,
  prospectKindLabel,
  matchNeedsToStock,
  stockMatchNotesBlock,
} from './monitorProspectMatch';
import type { EquipmentNeed } from '../types/monitor';

const need = (over: Partial<EquipmentNeed>): EquipmentNeed => ({
  id: 'n',
  category: null,
  qty_min: null,
  qty_max: null,
  confidence: null,
  rationale: null,
  created_at: '',
  ...over,
});

describe('classifyRole (PUR)', () => {
  it('lauréat / attributaire -> winner', () => {
    expect(classifyRole('Attributaire')).toBe('winner');
    expect(classifyRole('adjudicataire du marché')).toBe('winner');
    expect(classifyRole('Awarded contractor')).toBe('winner');
  });
  it('maître d’ouvrage / acheteur / adjudicateur -> buyer', () => {
    expect(classifyRole('client')).toBe('buyer');
    expect(classifyRole("Maître d'ouvrage")).toBe('buyer');
    expect(classifyRole('Pouvoir adjudicateur')).toBe('buyer');
  });
  it('vide / inconnu -> unknown', () => {
    expect(classifyRole('')).toBe('unknown');
    expect(classifyRole(null)).toBe('unknown');
    expect(classifyRole('consultant')).toBe('unknown');
  });
});

describe('prospectKindOfLead (PUR)', () => {
  it('utilise contact_role si présent', () => {
    expect(prospectKindOfLead({ contact_role: 'winner', title: 'X' })).toBe('winner');
    expect(prospectKindOfLead({ contact_role: 'buyer', title: 'X' })).toBe('buyer');
  });
  it('replie sur le titre si pas de contact_role', () => {
    expect(prospectKindOfLead({ title: 'Prospect lauréat - Route N1' })).toBe('winner');
    expect(prospectKindOfLead({ title: "Prospect AO (maître d'ouvrage) - Port" })).toBe('buyer');
    expect(prospectKindOfLead({ title: 'Prospect AO - Barrage' })).toBe('unknown');
  });
  it('libellé badge', () => {
    expect(prospectKindLabel('winner')).toBe('Lauréat');
    expect(prospectKindLabel('buyer')).toBe("Maître d'ouvrage");
    expect(prospectKindLabel('unknown')).toBeNull();
  });
});

describe('prospectAngle (PUR)', () => {
  it('winner -> négociation', () => {
    const a = prospectAngle('winner');
    expect(a.titlePrefix).toBe('Prospect lauréat');
    expect(a.nextAction).toMatch(/Négocier/);
    expect(a.roleNote).toMatch(/LAURÉAT/);
  });
  it('buyer -> soumission', () => {
    const a = prospectAngle('buyer');
    expect(a.nextAction).toMatch(/Soumissionner/);
  });
  it('unknown -> générique sans note de rôle', () => {
    const a = prospectAngle('unknown');
    expect(a.titlePrefix).toBe('Prospect AO');
    expect(a.roleNote).toBeNull();
  });
});

describe('matchNeedsToStock (PUR)', () => {
  it('compte les machines compatibles par mot-clé d’engin', () => {
    const needs = [
      need({ id: 'a', marketplace_label: 'Pelle hydraulique', qty_min: 1, qty_max: 2 }),
      need({ id: 'b', category: 'Chargeuse sur pneus', qty_min: 3, qty_max: 3 }),
      need({ id: 'c', marketplace_label: 'Concasseur', qty_min: 1, qty_max: 1 }),
    ];
    const stock = ['Pelle hydraulique CAT 320', 'Pelle Komatsu PC210', 'Chargeur frontal Volvo'];
    const res = matchNeedsToStock(needs, stock);
    expect(res.needsTotal).toBe(3);
    // 2 pelles compatibles, 1 chargeuse (chargeur), 0 concasseur
    expect(res.rows.find((r) => r.label === 'Pelle hydraulique')?.stockCount).toBe(2);
    expect(res.rows.find((r) => r.label === 'Chargeuse sur pneus')?.stockCount).toBe(1);
    expect(res.rows.find((r) => r.label === 'Concasseur')?.stockCount).toBe(0);
    expect(res.needsCovered).toBe(2);
  });

  it('stock vide -> 0 partout', () => {
    const res = matchNeedsToStock([need({ marketplace_label: 'Pelle' })], []);
    expect(res.needsCovered).toBe(0);
    expect(res.rows[0].stockCount).toBe(0);
  });

  it('aucun besoin -> résultat vide', () => {
    const res = matchNeedsToStock([], ['Pelle CAT']);
    expect(res).toEqual({ rows: [], needsCovered: 0, needsTotal: 0 });
  });
});

describe('stockMatchNotesBlock (PUR)', () => {
  it('rend un bloc lisible avec couverture', () => {
    const res = matchNeedsToStock(
      [need({ marketplace_label: 'Pelle hydraulique', qty_min: 1, qty_max: 2 })],
      ['Pelle CAT 320'],
    );
    const block = stockMatchNotesBlock(res);
    expect(block).toMatch(/compatible sur 1\/1/);
    expect(block).toMatch(/Pelle hydraulique — 1 en stock \/ 1–2/);
  });
  it('aucun besoin -> null', () => {
    expect(stockMatchNotesBlock({ rows: [], needsCovered: 0, needsTotal: 0 })).toBeNull();
  });
});
