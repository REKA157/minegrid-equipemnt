import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Recommendation } from '../../../utils/recommendations/recommendationsService';

const { buildRecommendations } = vi.hoisted(() => ({ buildRecommendations: vi.fn() }));
vi.mock('../../../utils/recommendations/recommendationsService', () => ({ buildRecommendations }));

import AIInsightsWidget from './AIInsightsWidget';

describe('AIInsightsWidget — recommandations réelles (anti-façade)', () => {
  beforeEach(() => buildRecommendations.mockReset());

  it('aucune recommandation -> état vide, AUCUN insight inventé', async () => {
    buildRecommendations.mockResolvedValue([]);
    render(<AIInsightsWidget />);
    await waitFor(() => expect(screen.getByText(/Aucune recommandation/)).toBeInTheDocument());
    expect(screen.queryByText(/→/)).toBeNull(); // aucune action sans donnée réelle
  });

  it('recommandations réelles -> cartes avec ACTION branchée (lead + risque)', async () => {
    const recos: Recommendation[] = [
      { id: 'risk:c1', title: 'Risque — Dossier A', detail: 'Paiement en litige.', action: 'Ouvrir le dossier pour corriger', href: '#dossier/c1', tone: 'urgent' },
      { id: 'lead:l1', title: 'Opportunité — Pelle 320D', detail: 'Lead chaud (score 80/100).', action: 'Créer le dossier transaction', href: '#leads', tone: 'warn' },
    ];
    buildRecommendations.mockResolvedValue(recos);
    render(<AIInsightsWidget />);
    await waitFor(() => expect(screen.getByText(/Risque — Dossier A/)).toBeInTheDocument());
    expect(screen.getByText(/Opportunité — Pelle 320D/)).toBeInTheDocument();
    // action branchée sur le vrai dossier
    const action = screen.getByText(/Ouvrir le dossier pour corriger/);
    expect(action.getAttribute('href')).toBe('#dossier/c1');
  });
});
