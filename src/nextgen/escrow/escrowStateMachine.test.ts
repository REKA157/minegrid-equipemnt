import { describe, it, expect } from 'vitest';
import {
  canTransition,
  canReleaseFunds,
  isTerminal,
  nextOnEvent,
  type EscrowConditions,
} from './escrowStateMachine';

const BOTH: EscrowConditions = { inspection: true, delivery: true };

describe('escrow state machine', () => {
  it('autorise les transitions valides et refuse les invalides', () => {
    expect(canTransition('created', 'funded')).toBe(true);
    expect(canTransition('funded', 'inspection_passed')).toBe(true);
    expect(canTransition('delivered', 'released')).toBe(true);
    // invalides
    expect(canTransition('created', 'released')).toBe(false);
    expect(canTransition('released', 'funded')).toBe(false);
    expect(canTransition('funded', 'delivered')).toBe(false); // doit passer par inspection
  });

  it('états terminaux', () => {
    expect(isTerminal('released')).toBe(true);
    expect(isTerminal('refunded')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('funded')).toBe(false);
  });

  it('ne libère les fonds que depuis delivered avec conditions satisfaites', () => {
    expect(canReleaseFunds('delivered', BOTH, { inspectionPassed: true, deliveryConfirmed: true })).toBe(true);
    // pas livré
    expect(canReleaseFunds('funded', BOTH, { inspectionPassed: true, deliveryConfirmed: true })).toBe(false);
    // inspection requise non passée
    expect(canReleaseFunds('delivered', BOTH, { inspectionPassed: false, deliveryConfirmed: true })).toBe(false);
    // livraison requise non confirmée
    expect(canReleaseFunds('delivered', BOTH, { inspectionPassed: true, deliveryConfirmed: false })).toBe(false);
  });

  it('libère sans inspection si la condition inspection est désactivée', () => {
    const cond: EscrowConditions = { inspection: false, delivery: true };
    expect(canReleaseFunds('delivered', cond, { inspectionPassed: false, deliveryConfirmed: true })).toBe(true);
  });

  it('nextOnEvent valide la transition', () => {
    expect(nextOnEvent('created', 'funded')).toBe('funded');
    expect(nextOnEvent('delivered', 'released')).toBe('released');
    expect(nextOnEvent('created', 'released')).toBeNull(); // transition invalide
    expect(nextOnEvent('funded', 'unknown_event')).toBeNull(); // événement inconnu
  });
});
