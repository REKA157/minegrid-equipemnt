import { describe, it, expect } from 'vitest';
import { buildMonitorSignals } from './monitorCorrelation';
import type { RealLead } from '../../../../services/realPipelineService';

const lead = (over: Partial<RealLead>): RealLead =>
  ({
    id: 'l1',
    seller_id: 's1',
    title: 'Prospect',
    stage: 'Prospection',
    priority: 'medium',
    value: 0,
    probability: 10,
    assigned_to: 's1',
    last_contact: '2026-06-13T00:00:00Z',
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
    ...over,
  }) as RealLead;

describe('buildMonitorSignals (M8/M9 Global Monitor → opportunité)', () => {
  it('monitor indisponible (map vide) → aucune carte', () => {
    const out = buildMonitorSignals([lead({ source_id: 'p1' })], new Map());
    expect(out.opportunities).toHaveLength(0);
  });

  it('lead ouvert rattaché à un projet détecté → opportunité', () => {
    const map = new Map<string, unknown>([['p1', { needs: 'pelles' }]]);
    const out = buildMonitorSignals([lead({ source_id: 'p1' })], map);
    expect(out.opportunities[0]?.id).toBe('corr:monitor-projects');
    expect(out.opportunities[0]?.label).toContain('1');
  });

  it('lead conclu rattaché → ignoré', () => {
    const map = new Map<string, unknown>([['p1', {}]]);
    const out = buildMonitorSignals([lead({ source_id: 'p1', stage: 'Conclu' })], map);
    expect(out.opportunities).toHaveLength(0);
  });

  it('source_id non présent dans le contexte monitor → ignoré', () => {
    const map = new Map<string, unknown>([['autre', {}]]);
    const out = buildMonitorSignals([lead({ source_id: 'p1' })], map);
    expect(out.opportunities).toHaveLength(0);
  });
});
