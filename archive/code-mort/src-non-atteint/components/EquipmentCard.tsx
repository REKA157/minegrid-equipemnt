import React from 'react';
import type { Equipment } from '../types';
import { MapPin, Star, Calendar, Wrench } from 'lucide-react';

interface EquipmentCardProps {
  equipment: Equipment;
}

export default function EquipmentCard({ equipment }: EquipmentCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <a href={`#machines/${equipment.id}`} className="block">
        <div className="relative">
          <img
            src={equipment.images[0]}
            alt={equipment.name}
            className="w-full h-48 object-cover"
          />
          <div className="absolute top-2 right-2 bg-primary-600 text-white px-2 py-1 rounded text-sm">
            {equipment.condition === 'new' ? 'Neuf' : 'Occasion'}
          </div>
        </div>
        
        <div className="p-4">
          <div className="mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{equipment.name}</h3>
            <p className="text-sm text-gray-600">{equipment.model}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="h-4 w-4 mr-1" />
              <span>{equipment.year}</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Wrench className="h-4 w-4 mr-1" />
              <span>
                {equipment.specifications.power?.value && equipment.specifications.power?.unit 
                  ? `${equipment.specifications.power.value} ${equipment.specifications.power.unit}`
                  : 'Non spécifié'
                }
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center text-sm text-gray-600">
              <MapPin className="h-4 w-4 mr-1" />
              <span>{equipment.seller.location}</span>
            </div>
            <div className="flex items-center text-sm">
              <Star className="h-4 w-4 text-yellow-400 mr-1" />
              <span>{equipment.seller.rating}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-primary-600">
              {equipment.price ? equipment.price.toLocaleString() : '0'} €
            </span>
            <span className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
              Détails
            </span>
          </div>
        </div>
      </a>
    </div>
  );
}