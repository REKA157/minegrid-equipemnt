import { describe, it, expect } from 'vitest';
import {
  buildInspectionCaseSignals,
  buildFinancingCaseSignals,
  buildTransportCaseSignals,
  buildCustomsCaseSignals,
  buildPaymentCaseSignals,
} from './chainCorrelation';

describe('chainCorrelation (M4-M7 chaîne dossier)', () => {
  it('M4 inspection : aucune ligne → aucune carte ; pending → carte', () => {
    expect(buildInspectionCaseSignals([])).toHaveLength(0);
    const out = buildInspectionCaseSignals([{ status: 'requested' } as any, { status: 'completed' } as any]);
    expect(out[0]?.id).toBe('corr:case-inspection');
    expect(out[0]?.label).toContain('1');
  });

  it('M6 financement : exclut approved/funded/rejected', () => {
    expect(buildFinancingCaseSignals([{ status: 'funded' } as any])).toHaveLength(0);
    expect(buildFinancingCaseSignals([{ status: 'submitted' } as any])).toHaveLength(1);
  });

  it('M7 transport : exclut delivered/cancelled', () => {
    expect(buildTransportCaseSignals([{ status: 'delivered' } as any])).toHaveLength(0);
    expect(buildTransportCaseSignals([{ status: 'planned' } as any])[0]?.id).toBe('corr:case-transport');
  });

  it('douane : missing_documents non vide ou statut non cleared → carte', () => {
    expect(buildCustomsCaseSignals([{ customs_status: 'cleared', missing_documents: [] } as any])).toHaveLength(0);
    expect(buildCustomsCaseSignals([{ customs_status: 'cleared', missing_documents: ['BL'] } as any])).toHaveLength(1);
    expect(buildCustomsCaseSignals([{ customs_status: 'pending', missing_documents: [] } as any])).toHaveLength(1);
  });

  it('M5 escrow : seulement les paiements en attente', () => {
    expect(buildPaymentCaseSignals([{ status: 'released' } as any])).toHaveLength(0);
    expect(buildPaymentCaseSignals([{ status: 'held' } as any])[0]?.id).toBe('corr:case-payment');
  });
});
