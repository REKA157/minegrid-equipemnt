import { describe, it, expect } from 'vitest';
import { computeTransactionRisk, type RiskInputs } from './transactionRisk';

const empty: RiskInputs = { events: [], payments: [], inspections: [] };

describe('transactionRisk — risque dossier (faits réels, anti-faux-positif)', () => {
  it('aucun signal -> low, score 0, signals vides (rien à afficher)', () => {
    const r = computeTransactionRisk(empty);
    expect(r.level).toBe('low');
    expect(r.score).toBe(0);
    expect(r.signals).toHaveLength(0);
  });

  it('paiement en litige -> high', () => {
    const r = computeTransactionRisk({
      ...empty,
      payments: [{ status: 'disputed', amount: 1000, payment_type: 'escrow' }],
    });
    expect(r.level).toBe('high');
    expect(r.signals.some((s) => s.code === 'payment_disputed')).toBe(true);
  });

  it('FONDS SÉQUESTRÉS (held) sans inspection validée -> high (cœur anti-arnaque)', () => {
    const r = computeTransactionRisk({
      events: [],
      payments: [{ status: 'held', amount: 5000, payment_type: 'escrow' }],
      inspections: [{ status: 'a_assigner' }], // inspection demandée mais PAS validée
    });
    expect(r.level).toBe('high');
    expect(r.signals.some((s) => s.code === 'payment_before_inspection')).toBe(true);
  });

  it('FLUX NORMAL : escrow awaiting_partner (non financé) + inspection en cours -> AUCUN risque', () => {
    // create_payment_step crée 'awaiting_partner' (aucun argent) ; ne doit PAS être un faux positif.
    const r = computeTransactionRisk({
      events: [],
      payments: [{ status: 'awaiting_partner', amount: 0, payment_type: 'escrow' }],
      inspections: [{ status: 'a_assigner' }],
    });
    expect(r.level).toBe('low');
    expect(r.signals).toHaveLength(0);
  });

  it('paiement engagé APRÈS inspection validée -> pas ce signal', () => {
    const r = computeTransactionRisk({
      events: [],
      payments: [{ status: 'held', amount: 5000, payment_type: 'escrow' }],
      inspections: [{ status: 'completed' }],
    });
    expect(r.signals.some((s) => s.code === 'payment_before_inspection')).toBe(false);
  });

  it('fonds séquestrés (held) au montant 0 -> anomalie medium ; awaiting_partner 0 -> rien', () => {
    const held0 = computeTransactionRisk({
      events: [],
      payments: [{ status: 'held', amount: 0, payment_type: 'escrow' }],
      inspections: [{ status: 'completed' }], // inspection ok pour isoler le signal montant
    });
    expect(held0.signals.some((s) => s.code === 'amount_unconfirmed')).toBe(true);

    const awaiting0 = computeTransactionRisk({
      events: [],
      payments: [{ status: 'awaiting_partner', amount: 0, payment_type: 'escrow' }],
      inspections: [],
    });
    expect(awaiting0.signals.some((s) => s.code === 'amount_unconfirmed')).toBe(false);
  });

  it('partenaires désengagés (refus/révocation) -> signal medium explicite', () => {
    const r = computeTransactionRisk({
      events: [{ event_type: 'participant.declined' }, { event_type: 'participant.revoked' }],
      payments: [],
      inspections: [],
    });
    expect(r.signals.some((s) => s.code === 'partner_disengaged')).toBe(true);
    expect(r.level).toBe('medium');
  });
});
