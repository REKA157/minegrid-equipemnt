import { describe, it, expect } from 'vitest';
import {
  buildInspectionCaseSignals,
  buildFinancingCaseSignals,
  buildTransportCaseSignals,
  buildCustomsCaseSignals,
  buildPaymentCaseSignals,
  buildPendingInvitationSignals,
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

  it('invitations en attente : aucune ligne → aucune carte ; sinon carte warn vers #dossiers', () => {
    expect(buildPendingInvitationSignals([])).toHaveLength(0);
    const out = buildPendingInvitationSignals([
      { role: 'mechanic', case_title: 'Dossier A' } as any,
      { role: 'broker', case_title: null } as any,
    ]);
    expect(out[0]?.id).toBe('corr:pending-invitations');
    expect(out[0]?.tone).toBe('warn');
    expect(out[0]?.href).toBe('#dossiers');
    expect(out[0]?.label).toContain('2');
  });

  it('invitation unique : le titre du dossier est repris dans le détail', () => {
    const out = buildPendingInvitationSignals([{ role: 'mechanic', case_title: 'Pelle 320D' } as any]);
    expect(out[0]?.detail).toContain('Pelle 320D');
  });

  it('statuts du write-side reconnus par le read-side (cartes visibles)', () => {
    // Statuts posés par les RPC create_*_step (sql/2026-06_transaction_chain_write_side.sql).
    expect(buildInspectionCaseSignals([{ status: 'a_assigner' } as any])).toHaveLength(1);
    expect(buildInspectionCaseSignals([{ status: 'assigned' } as any])).toHaveLength(1);
    expect(buildFinancingCaseSignals([{ status: 'a_examiner' } as any])).toHaveLength(1);
    expect(buildTransportCaseSignals([{ status: 'a_planifier' } as any])).toHaveLength(1);
    expect(buildCustomsCaseSignals([{ customs_status: 'a_traiter', missing_documents: [] } as any])).toHaveLength(1);
    expect(buildPaymentCaseSignals([{ status: 'awaiting_partner' } as any])[0]?.id).toBe('corr:case-payment');
  });
});
