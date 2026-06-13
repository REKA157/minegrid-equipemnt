import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrustBadge from './TrustBadge';

describe('TrustBadge', () => {
  it('affiche le libellé du tier et le score', () => {
    render(<TrustBadge tier="trusted" score={72} />);
    expect(screen.getByText('Vendeur de confiance')).toBeInTheDocument();
    expect(screen.getByText(/72/)).toBeInTheDocument();
  });

  it('expose un libellé accessible (aria-label)', () => {
    render(<TrustBadge tier="elite" score={90} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-label', expect.stringContaining('Élite'));
    expect(el).toHaveAttribute('aria-label', expect.stringContaining('90'));
  });

  it('rend l\'état non vérifié sans planter sans score', () => {
    render(<TrustBadge tier="unverified" />);
    expect(screen.getByText('Non vérifié')).toBeInTheDocument();
  });
});
