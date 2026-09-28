import React from 'react';
import EquipmentCard from './EquipmentCard';
import type { Equipment } from '../types';

const featuredEquipment: Equipment[] = [
  {
    id: '1',
    name: 'Finisseur VÖGELE SUPER 1800-3i',
    brand: 'VÖGELE',
    category: 'Matériel de Voirie',
    year: 2023,
    price: 450000,
    condition: 'new',
    description: 'Finisseur haute performance pour travaux routiers',
    specifications: {
      weight: 19500,
      dimensions: '6.1m x 2.55m x 3.0m',
      power: '127 kW',
    },
    images: ['https://images.unsplash.com/photo-1573176054053-b0e345766088?auto=format&fit=crop&w=800&q=80'],
    seller: {
      id: 's1',
      name: 'Maroc Equipement Pro',
      rating: 4.8,
      location: 'Casablanca',
    },
  },
  {
    id: '2',
    name: 'Pelle Hydraulique CAT 349',
    brand: 'Caterpillar',
    category: 'Pelles & Excavateurs',
    year: 2022,
    price: 380000,
    condition: 'used',
    description: 'Pelle hydraulique haute performance pour mines et carrières',
    specifications: {
      weight: 45000,
      dimensions: '12.5m x 3.29m x 3.85m',
      power: '311 kW',
    },
    images: ['https://images.unsplash.com/photo-1581094488379-6a10d01f3a37?auto=format&fit=crop&w=800&q=80'],
    seller: {
      id: 's2',
      name: 'Solutions BTP Maroc',
      rating: 4.6,
      location: 'Rabat',
    },
  },
  {
    id: '3',
    name: 'Concasseur Mobile KLEEMANN MC 110 Zi EVO',
    brand: 'KLEEMANN',
    category: 'Concasseurs',
    year: 2023,
    price: 520000,
    condition: 'new',
    description: 'Concasseur mobile à mâchoires pour applications minières',
    specifications: {
      weight: 38500,
      dimensions: '13.9m x 3.0m x 3.6m',
      power: '240 kW',
    },
    images: [''],
    seller: {
      id: 's3',
      name: 'WIRTGEN GROUP Maroc',
      rating: 4.9,
      location: 'Tanger',
    },
  },
];

export default function FeaturedEquipment() {
  return (
    <div className="py-8 bg-gradient-to-b from-primary-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Équipements en Vedette</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredEquipment.map((equipment) => (
            <EquipmentCard key={equipment.id} equipment={equipment} />
          ))}
        </div>
      </div>
    </div>
  );
}