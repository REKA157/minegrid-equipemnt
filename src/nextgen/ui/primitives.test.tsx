import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, EmptyState, LiveTag } from './primitives';

describe('primitives UI (statuts honnêtes)', () => {
  it('StatusBadge affiche le bon libellé', () => {
    render(<StatusBadge status="available" />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('StatusBadge « en attente partenaire »', () => {
    render(<StatusBadge status="awaiting_partner" />);
    expect(screen.getByText('En attente partenaire')).toBeInTheDocument();
  });

  it('EmptyState n\'invente pas de donnée', () => {
    render(<EmptyState status="awaiting_deployment" />);
    expect(screen.getAllByText(/non disponible|déploiement/i).length).toBeGreaterThan(0);
  });

  it('LiveTag signale un calcul réel', () => {
    render(<LiveTag />);
    expect(screen.getByText('Calcul réel')).toBeInTheDocument();
  });
});
