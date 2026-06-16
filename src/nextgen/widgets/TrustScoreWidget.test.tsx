import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { NetworkPartner } from '../../utils/partner/partnerNetwork';
import type { TrustTier } from '../../utils/partner/partnerTrust';

const { buildNetworkForRole } = vi.hoisted(() => ({ buildNetworkForRole: vi.fn() }));
vi.mock('../../utils/partner/partnerPerformanceService', () => ({ buildNetworkForRole }));

import TrustScoreWidget from './TrustScoreWidget';

function partner(
  id: string,
  score: number,
  tier: TrustTier,
  load: number,
  cancellation = 0,
  reasons: string[] = ['Complétion 80% (4/5 terminés).'],
): NetworkPartner {
  return {
    partnerId: id,
    openLoad: load,
    total: load + 2,
    trust: { hasData: true, trustScore: score, tier, cancellationRate: cancellation, reasons },
  };
}

describe('TrustScoreWidget — outil de décision réseau (anti-façade)', () => {
  beforeEach(() => buildNetworkForRole.mockReset());

  it('aucune donnée partenaire -> état vide pédagogique, AUCUN score inventé', async () => {
    buildNetworkForRole.mockResolvedValue({ best: null, ranked: [], saturated: [], toAvoid: [] });
    render(<TrustScoreWidget />);
    await waitFor(() => expect(screen.getByText(/Aucun partenaire évalué/)).toBeInTheDocument());
    // anti-façade : aucun partenaire inventé, aucune action partenaire (CTA) sans donnée réelle
    expect(screen.queryByText(/meilleur disponible/)).toBeNull();
    expect(screen.queryByText(/Assigner sur un dossier/)).toBeNull();
    expect(screen.queryByText(/charge \d/)).toBeNull(); // aucune ligne partenaire (qui afficherait « charge N »)
  });

  it('partenaire réel LIBRE -> recommandé + RAISON + ACTION « Assigner »', async () => {
    const p = partner('aaaaaaaa-1111-2222-3333-444444444444', 90, 'gold', 0); // charge 0 = libre
    buildNetworkForRole.mockResolvedValue({ best: p, ranked: [p], saturated: [], toAvoid: [] });
    render(<TrustScoreWidget />);
    await waitFor(() => expect(screen.getByText(/meilleur disponible/)).toBeInTheDocument());
    expect(screen.getByText(/90\/100/)).toBeInTheDocument(); // score RÉEL (pas saisi)
    expect(screen.getByText(/Complétion 80%/)).toBeInTheDocument(); // raison du classement
    expect(screen.getByText(/Assigner sur un dossier/)).toBeInTheDocument(); // action concrète
  });

  it('partenaire avec dossiers en cours -> action « Relancer » (contextuelle à la charge réelle)', async () => {
    const p = partner('cccccccc-9999-aaaa-bbbb-cccccccccccc', 75, 'silver', 3); // charge 3 = dossiers en cours
    buildNetworkForRole.mockResolvedValue({ best: p, ranked: [p], saturated: [], toAvoid: [] });
    render(<TrustScoreWidget />);
    await waitFor(() => expect(screen.getByText(/meilleur disponible/)).toBeInTheDocument());
    expect(screen.getByText(/Relancer ses dossiers/)).toBeInTheDocument();
    expect(screen.queryByText(/Assigner sur un dossier/)).toBeNull(); // pas « assigner » s'il est déjà chargé
  });

  it('partenaire à éviter affiché distinctement avec sa raison', async () => {
    const bad = partner('bbbbbbbb-5555-6666-7777-888888888888', 30, 'bronze', 1, 0.5, [
      'Complétion 40% (2/5 terminés).',
      "Taux d'échec élevé (> 30%) — confiance plafonnée à Bronze.",
    ]);
    buildNetworkForRole.mockResolvedValue({ best: null, ranked: [bad], saturated: [], toAvoid: [bad] });
    render(<TrustScoreWidget />);
    await waitFor(() => expect(screen.getByText(/À éviter/)).toBeInTheDocument());
    expect(screen.getByText(/éviter d'assigner/)).toBeInTheDocument();
    expect(screen.getByText(/plafonnée à Bronze/)).toBeInTheDocument();
  });
});
