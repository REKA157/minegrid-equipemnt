import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MachineCardTrustStrip from './MachineCardTrustStrip';

describe('MachineCardTrustStrip (honnête, sans fausse affirmation)', () => {
  it('affiche les capacités de service', () => {
    render(<MachineCardTrustStrip />);
    expect(screen.getByText('Confiance')).toBeInTheDocument();
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.getByText('Séquestre')).toBeInTheDocument();
    expect(screen.getByText('Financement')).toBeInTheDocument();
  });

  it('ne prétend PAS que le vendeur est vérifié (anti-façade)', () => {
    render(<MachineCardTrustStrip />);
    expect(screen.queryByText(/vérifié/i)).not.toBeInTheDocument();
  });
});
