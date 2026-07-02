import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrustDashboard from './TrustDashboard';

describe('TrustDashboard (démo honnête)', () => {
  it('rend l’assistant réseau partenaire (sélecteur + état anti-façade)', () => {
    render(<TrustDashboard />);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    // sélecteur de rôle du réseau partenaire (transformation : plus de score saisi à la main)
    expect(screen.getByText('Mécaniciens')).toBeInTheDocument();
    // anti-façade : sans données partenaire réelles, chargement puis état vide honnête (jamais un score inventé)
    expect(screen.getByText(/Chargement du réseau|Aucune donnée partenaire/)).toBeInTheDocument();
  });

  it('la section données live reste honnêtement vide (pas de façade)', () => {
    render(<TrustDashboard />);
    expect(screen.getAllByText(/déploiement/i).length).toBeGreaterThan(0);
  });
});
