import type { Machine } from '../types';

export const machines: Machine[] = [
  {
    id: '1',
    name: 'Finisseur VÖGELE SUPER 1800-3i',
    brand: 'VÖGELE',
    model: 'SUPER 1800-3i',
    category: 'Matériel de Voirie',
    year: 2023,
    price: 450000,
    condition: 'new',
    description: `Le finisseur VÖGELE SUPER 1800-3i représente la nouvelle génération de finisseurs sur pneus.`,
    specifications: {
      weight: 19500,
      dimensions: '6.1m x 2.55m x 3.0m',
      power: { value: 127, unit: 'kW' },
      operatingCapacity: 18500,
      workingWeight: 19500
    },
    images: [
      'https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1581094487326-5937e8490a87?auto=format&fit=crop&w=800&q=80'
    ],
    seller: {
      id: 's1',
      name: 'Minegrid Equipment Pro',
      rating: 4.8,
      location: 'Casablanca',
    }
  },
  {
    id: '2',
    name: 'Compacteur HAMM 3411',
    brand: 'HAMM',
    model: '3411',
    category: 'Compacteurs',
    year: 2021,
    price: 87000,
    condition: 'used',
    description: `Compacteur monocylindre HAMM 3411. Très bon état. Prêt à travailler.`,
    specifications: {
      weight: 11000,
      dimensions: '5.0m x 2.4m x 3.0m',
      power: { value: 85, unit: 'kW' },
      operatingCapacity: 10000,
      workingWeight: 11000
    },
    images: [
      'https://images.unsplash.com/photo-1570126681446-66f8f1b15f3c?auto=format&fit=crop&w=800&q=80'
    ],
    seller: {
      id: 's2',
      name: 'Compacteurs Maroc',
      rating: 4.2,
      location: 'Tanger',
    }
  }
];
