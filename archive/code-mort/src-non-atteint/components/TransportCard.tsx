import React from 'react';
import { Truck, MapPin, Clock } from 'lucide-react';
import { estimerTransport, formatCost, formatDelay, getDestinationsByContinent } from '../utils/transport';

interface TransportCardProps {
  machineWeight?: number; // Poids en tonnes
  machineVolume?: number; // Volume en m³
  origin?: string;
  className?: string;
}

const mainDestinations = ['Abidjan', 'Dakar', 'Lagos', 'Accra'];

export default function TransportCard({ 
  machineWeight, 
  machineVolume, 
  origin = 'Casablanca',
  className = "" 
}: TransportCardProps) {
  
  const getTransportCosts = () => {
    return mainDestinations.map(destination => {
      const cost = estimerTransport(origin, destination, machineWeight, machineVolume);
      return {
        destination,
        cost: cost?.cost || 0,
        days: cost?.days || 0
      };
    }).filter(item => item.cost > 0);
  };

  const transportCosts = getTransportCosts();

  if (transportCosts.length === 0) {
    return null;
  }

  // Déterminer si l'origine est européenne ou marocaine
  const isEuropeanOrigin = ['Marseille', 'Rotterdam', 'Hambourg', 'Anvers'].includes(origin);
  const originType = isEuropeanOrigin ? 'Europe' : 'Maroc';

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      <div className="flex items-center mb-3">
        <Truck className="h-5 w-5 text-orange-600 mr-2" />
        <h3 className="text-sm font-semibold text-gray-900">Transport International</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2 flex items-center">
            🌍 Destinations africaines
          </h4>
          <div className="space-y-2">
            {transportCosts.map((item) => (
              <div key={item.destination} className="flex justify-between items-center text-sm">
                <div className="flex items-center">
                  <MapPin className="h-3 w-3 text-gray-500 mr-1" />
                  <span className="text-gray-700">{item.destination}</span>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    isEuropeanOrigin ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {formatCost(item.cost)}
                  </div>
                  <div className="flex items-center text-xs text-gray-500">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDelay(item.days)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          Depuis {origin} ({originType}) • Estimation indicative
        </p>
      </div>
    </div>
  );
} 