import { describe, it, expect } from 'vitest';
import { derivePartnerInsights, type ChainStepLite, type RoleNetworkLite } from './partnerAssignmentInsights';
import type { PartnerRole } from '../partner/partnerEvents';

const emptySteps = (): Record<PartnerRole, ChainStepLite[]> => ({ mechanic: [], carrier: [], broker: [], forwarder: [] });
const emptyNet = (): Record<PartnerRole, RoleNetworkLite> => ({
  mechanic: { hasBest: false, saturatedIds: new Set() },
  carrier: { hasBest: false, saturatedIds: new Set() },
  broker: { hasBest: false, saturatedIds: new Set() },
  forwarder: { hasBest: false, saturatedIds: new Set() },
});
const titles = new Map([['case1', 'Pelle CAT']]);

describe('derivePartnerInsights (PUR)', () => {
  it('étape active non assignée + meilleur partenaire dispo -> gap', () => {
    const steps = emptySteps();
    steps.mechanic = [{ caseId: 'case1', partnerId: null, terminal: false }];
    const net = emptyNet();
    net.mechanic = { hasBest: true, saturatedIds: new Set() };
    const { gaps, saturations } = derivePartnerInsights(titles, steps, net);
    expect(saturations).toEqual([]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ caseId: 'case1', role: 'mechanic', title: 'Pelle CAT' });
  });

  it('non assignée mais AUCUN meilleur dispo -> pas de gap (anti-façade)', () => {
    const steps = emptySteps();
    steps.mechanic = [{ caseId: 'case1', partnerId: null, terminal: false }];
    const { gaps } = derivePartnerInsights(titles, steps, emptyNet());
    expect(gaps).toEqual([]);
  });

  it('étape assignée à un partenaire saturé -> saturation', () => {
    const steps = emptySteps();
    steps.carrier = [{ caseId: 'case1', partnerId: 'p9', terminal: false }];
    const net = emptyNet();
    net.carrier = { hasBest: false, saturatedIds: new Set(['p9']) };
    const { gaps, saturations } = derivePartnerInsights(titles, steps, net);
    expect(gaps).toEqual([]);
    expect(saturations).toHaveLength(1);
    expect(saturations[0]).toMatchObject({ caseId: 'case1', role: 'carrier', partnerId: 'p9' });
  });

  it('étape TERMINALE ignorée (ni gap ni saturation)', () => {
    const steps = emptySteps();
    steps.mechanic = [{ caseId: 'case1', partnerId: null, terminal: true }];
    const net = emptyNet();
    net.mechanic = { hasBest: true, saturatedIds: new Set() };
    const { gaps, saturations } = derivePartnerInsights(titles, steps, net);
    expect(gaps).toEqual([]);
    expect(saturations).toEqual([]);
  });

  it('partenaire assigné mais NON saturé -> aucune saturation', () => {
    const steps = emptySteps();
    steps.broker = [{ caseId: 'case1', partnerId: 'p1', terminal: false }];
    const net = emptyNet();
    net.broker = { hasBest: true, saturatedIds: new Set(['autre']) };
    const { saturations } = derivePartnerInsights(titles, steps, net);
    expect(saturations).toEqual([]);
  });
});
