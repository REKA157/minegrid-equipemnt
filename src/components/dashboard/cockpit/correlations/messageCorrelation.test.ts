import { describe, it, expect } from 'vitest';
import { buildMessageSignals } from './messageCorrelation';

describe('buildMessageSignals (M12 messages → action)', () => {
  it('aucun message → aucune carte', () => {
    expect(buildMessageSignals([]).priorities).toHaveLength(0);
  });

  it('tous lus → aucune carte', () => {
    expect(buildMessageSignals([{ is_read: true }, { is_read: true }]).priorities).toHaveLength(0);
  });

  it('messages non lus → carte avec le compte', () => {
    const out = buildMessageSignals([{ is_read: false }, { is_read: false }, { is_read: true }]);
    expect(out.priorities[0]?.id).toBe('corr:messages-unread');
    expect(out.priorities[0]?.label).toContain('2');
    expect(out.priorities[0]?.tone).toBe('warn');
  });

  it('>= 5 non lus → urgent', () => {
    const many = Array.from({ length: 6 }, () => ({ is_read: false }));
    expect(buildMessageSignals(many).priorities[0]?.tone).toBe('urgent');
  });
});
