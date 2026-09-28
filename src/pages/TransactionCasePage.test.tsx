import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TransactionCasePage from './TransactionCasePage';
import type { TransactionCaseRow } from '../utils/api/transactionCases';

/**
 * Aucun écran ne doit conseiller à un exploitant d'exécuter
 * sql/transaction_platform_extended.sql : ce script ré-accorde les écritures sur
 * payment_records, audit_logs, inspection_reports et commission_records. La même
 * interdiction est déjà écrite dans MachineDetail.tsx ; ces tests l'imposent aux
 * deux chemins de rendu de cette page (« dossier introuvable » et journal d'audit
 * vide), qui ne dépendent d'aucun drapeau et sont donc atteignables par n'importe
 * quel utilisateur connecté.
 */

const getTransactionCase = vi.fn();
const listTransactionParticipants = vi.fn();
const listTransactionEvents = vi.fn();

vi.mock('../utils/api/transactionCases', () => ({
  getTransactionCase: (...a: unknown[]) => getTransactionCase(...a),
  listTransactionParticipants: (...a: unknown[]) => listTransactionParticipants(...a),
  listTransactionEvents: (...a: unknown[]) => listTransactionEvents(...a),
}));

vi.mock('../utils/supabaseClient', () => ({
  default: { auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } },
}));

// Objets liés : toutes les listes vides (cas réel d'une instance sans module transaction).
vi.mock('../utils/api/transactionPlatform', () => {
  const vide = async () => [];
  const service = { listByCase: vide, listRequestsByCase: vide, listReportsByCase: vide };
  return {
    auditLogService: service,
    brokerCaseService: service,
    commissionRecordService: service,
    customsCaseService: service,
    financingRequestService: service,
    inspectionService: service,
    logisticsTaskService: service,
    paymentRecordService: service,
    transactionDocumentService: service,
    transactionMessageService: service,
    transactionTaskService: service,
    transportRequestService: service,
  };
});

vi.mock('../utils/api/transactionChain', () => ({
  advanceTransactionCaseStep: async () => ({ ok: false, reason: 'not_deployed' }),
  assignTransactionPartner: async () => ({ ok: false, reason: 'not_deployed' }),
  revokeTransactionPartner: async () => ({ ok: false, reason: 'not_deployed' }),
  acceptTransactionInvitation: async () => ({ ok: false, reason: 'not_deployed' }),
  declineTransactionInvitation: async () => ({ ok: false, reason: 'not_deployed' }),
  completeInspectionStep: async () => ({ ok: false, reason: 'not_deployed' }),
  confirmDelivery: async () => ({ ok: false, reason: 'not_deployed' }),
  clearCustoms: async () => ({ ok: false, reason: 'not_deployed' }),
  closeTransactionCase: async () => ({ ok: false, reason: 'not_deployed' }),
  cancelTransactionCase: async () => ({ ok: false, reason: 'not_deployed' }),
}));

vi.mock('../utils/partner/partnerPerformanceService', () => ({
  buildNetworkForRole: async () => null,
}));

const DOSSIER: TransactionCaseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  kind: 'sale',
  status: 'negotiation',
  machine_id: null,
  seller_user_id: 'u-2',
  buyer_user_id: 'u-1',
  primary_quote_request_id: null,
  primary_lead_id: null,
  title: 'Dossier de test',
  notes: null,
  created_by: 'u-1',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  closed_at: null,
};

/** Nom du script dont l'exécution ne doit jamais être suggérée dans l'interface. */
const SCRIPT_INTERDIT = /transaction_platform_extended/i;

beforeEach(() => {
  vi.clearAllMocks();
  listTransactionParticipants.mockResolvedValue([]);
  listTransactionEvents.mockResolvedValue([]);
});

describe('TransactionCasePage — aucune consigne d’exécuter un script SQL', () => {
  it('« Dossier introuvable » : explique le problème sans nommer de script à exécuter', async () => {
    getTransactionCase.mockResolvedValue(null);
    render(<TransactionCasePage caseId="inconnu" />);

    await waitFor(() => expect(screen.getByText(/Dossier introuvable/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(SCRIPT_INTERDIT);
    expect(document.body.textContent).not.toMatch(/\.sql/i);
    // Pas de message vide non plus : l'utilisateur doit comprendre pourquoi l'écran est vide.
    expect(document.body.textContent).toMatch(/n’existe pas ou vous n’y avez pas accès/i);
  });

  it('journal d’audit vide : dit que le journal est indisponible sans nommer de script', async () => {
    getTransactionCase.mockResolvedValue(DOSSIER);
    render(<TransactionCasePage caseId={DOSSIER.id} />);

    await waitFor(() => expect(screen.getByText(/Journal d’audit/i)).toBeTruthy());
    await waitFor(() => expect(document.body.textContent).toMatch(/Aucune entrée/i));
    expect(document.body.textContent).not.toMatch(SCRIPT_INTERDIT);
    expect(document.body.textContent).not.toMatch(/\.sql/i);
  });
});
