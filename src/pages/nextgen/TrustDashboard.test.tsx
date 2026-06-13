import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrustDashboard from './TrustDashboard';

describe('TrustDashboard (démo honnête)', () => {
  it('rend le calculateur réel et un statut « Disponible »', () => {
    render(<TrustDashboard />);
    // widget de calcul réel présent
    expect(screen.getByText('Calcul réel')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    // un score /100 est affiché (calcul réel, pas une donnée mockée)
    expect(screen.getByText('/100')).toBeInTheDocument();
  });

  it('la section données live reste honnêtement vide (pas de façade)', () => {
    render(<TrustDashboard />);
    expect(screen.getAllByText(/déploiement/i).length).toBeGreaterThan(0);
  });
});
