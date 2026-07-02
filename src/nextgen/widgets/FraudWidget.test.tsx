import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { CaseRisk } from '../../utils/risk/caseRiskService';

const { loadCaseRisks } = vi.hoisted(() => ({ loadCaseRisks: vi.fn() }));
vi.mock('../../utils/risk/caseRiskService', () => ({ loadCaseRisks }));

import FraudWidget from './FraudWidget';

describe('FraudWidget — moniteur de risque dossier (anti-façade)', () => {
  beforeEach(() => loadCaseRisks.mockReset());

  it('aucun risque -> message « rien à signaler », AUCUNE alerte inventée', async () => {
    loadCaseRisks.mockResolvedValue([]);
    render(<FraudWidget />);
    await waitFor(() => expect(screen.getByText(/rien à signaler/)).toBeInTheDocument());
    expect(screen.queryByText(/Ouvrir le dossier/)).toBeNull(); // pas d'action sans risque réel
  });

  it('dossier à risque -> signaux EXPLICABLES + ACTION ouvrir le dossier', async () => {
    const risk: CaseRisk = {
      caseId: 'case-1',
      title: 'Dossier Pelle 320D',
      risk: {
        level: 'high',
        score: 75,
        signals: [{ code: 'payment_disputed', label: 'Paiement en litige (escrow disputed).', severity: 'high' }],
      },
    };
    loadCaseRisks.mockResolvedValue([risk]);
    render(<FraudWidget />);
    await waitFor(() => expect(screen.getByText(/Dossier Pelle 320D/)).toBeInTheDocument());
    expect(screen.getByText(/Paiement en litige/)).toBeInTheDocument(); // raison explicable
    const action = screen.getByText(/Ouvrir le dossier/);
    expect(action).toBeInTheDocument();
    expect(action.getAttribute('href')).toBe('#dossier/case-1'); // action branchée sur le vrai dossier
  });
});
