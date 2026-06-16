import { describe, it, expect } from 'vitest';
import { selectQuotesWithoutCase, selectStaleQuotes, type QuoteRow } from './quoteInsights';

const q = (over: Partial<QuoteRow>): QuoteRow => ({ id: 'q', machine_id: 'm1', ...over });

describe('quoteInsights.selectQuotesWithoutCase (PUR)', () => {
  it('devis sans dossier -> groupés par machine', () => {
    const out = selectQuotesWithoutCase(
      [
        q({ id: 'a', machine_id: 'm1', brand: 'CAT', machine_name: '320D' }),
        q({ id: 'b', machine_id: 'm1' }),
        q({ id: 'c', machine_id: 'm2' }),
      ],
      new Set(),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ machineId: 'm1', quoteCount: 2 });
    expect(out[0].title).toBe('CAT 320D');
  });

  it('exclut devis rattaché par les 3 liens (direct, machine, primary_quote_request_id)', () => {
    const out = selectQuotesWithoutCase(
      [
        q({ id: 'a', machine_id: 'm1', transaction_case_id: 'c1' }), // lien direct
        q({ id: 'b', machine_id: 'm2' }), // machine a un dossier
        q({ id: 'd', machine_id: 'm3' }), // dossier le référence via primary_quote_request_id
      ],
      new Set(['m2']),
      new Set(['d']),
    );
    expect(out).toEqual([]);
  });
});

describe('quoteInsights.selectStaleQuotes (PUR)', () => {
  const NOW = Date.parse('2026-06-16T00:00:00Z');
  const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

  it('compte les devis new/contacted plus vieux que 7 j (le plus ancien remonté)', () => {
    const out = selectStaleQuotes(
      [
        q({ id: 'a', status: 'new', created_at: daysAgo(20), machine_id: 'm9' }),
        q({ id: 'b', status: 'contacted', created_at: daysAgo(10) }),
        q({ id: 'c', status: 'new', created_at: daysAgo(2) }), // trop récent
        q({ id: 'd', status: 'qualified', created_at: daysAgo(30) }), // déjà traité
      ],
      NOW,
    );
    expect(out.count).toBe(2);
    expect(out.oldestMachineId).toBe('m9');
    expect(out.oldestDays).toBe(20);
  });

  it('aucun devis stale -> count 0 (anti-façade)', () => {
    expect(selectStaleQuotes([], NOW)).toEqual({ count: 0, oldestMachineId: null, oldestDays: 0 });
  });
});
