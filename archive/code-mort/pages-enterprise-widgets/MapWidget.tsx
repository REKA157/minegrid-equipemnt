import { Widget } from '../types';
import React, { useState } from 'react';
import { iconMap } from './iconMap';
import {
  ArrowRight,
  FileText,
  Globe,
  Package,
  Truck,
  X,
} from 'lucide-react';

export const MapWidget = ({ widget, data }: { widget: Widget; data: any[] }) => {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showMap, setShowMap] = useState(false);

  // Récupérer l'icône depuis le mapping
  const IconComponent = typeof widget.icon === 'string' ? iconMap[widget.icon] : widget.icon;
  const Icon = IconComponent || Globe; // Fallback vers Globe

  const handleItemClick = (item: any) => {
    setSelectedItem(item);
    setShowMap(true);
  };

  const handleCloseMap = () => {
    setShowMap(false);
    setSelectedItem(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'En route':
        return <Truck className="h-4 w-4 text-blue-600" />;
      case 'Livraison':
        return <Package className="h-4 w-4 text-green-600" />;
      case 'Retour':
        return <ArrowRight className="h-4 w-4 text-orange-600" />;
      case 'En transit':
        return <Globe className="h-4 w-4 text-purple-600" />;
      case 'En douane':
        return <FileText className="h-4 w-4 text-yellow-600" />;
      default:
        return <Globe className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'En route':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Livraison':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'Retour':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'En transit':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'En douane':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Icon className="h-6 w-6 text-orange-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">{widget.title}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">
              {data.length} éléments actifs
            </span>
            <button
              className="text-orange-600 hover:text-orange-700 text-sm font-medium flex items-center"
              onClick={() => setShowMap(true)}
            >
              <Globe className="h-4 w-4 mr-1" />
              Voir carte
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {data.slice(0, 5).map((item, index) => (
            <div
              key={index}
              className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              onClick={() => handleItemClick(item)}
            >
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                {getStatusIcon(item.status)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {item.vehicle || item.id || item.route || item.title}
                </div>
                <div className="text-sm text-gray-600 flex items-center">
                  <Globe className="h-3 w-3 mr-1" />
                  {item.location || 'Position GPS'}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium px-2 py-1 rounded-full border ${getStatusColor(item.status)}`}>
                  {item.status}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {item.eta ? `ETA: ${item.eta}` : 'En cours'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {data.length > 5 && (
          <div className="mt-4 text-center">
            <button className="text-orange-600 hover:text-orange-700 text-sm font-medium">
              Voir tous les {data.length} éléments
            </button>
          </div>
        )}
      </div>

      {/* Modal de carte interactive */}
      {showMap && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-11/12 h-5/6 max-w-4xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                Carte de suivi - {selectedItem?.vehicle || selectedItem?.id || 'Tous les éléments'}
              </h3>
              <button
                onClick={handleCloseMap}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 p-4">
              <div className="bg-gray-100 rounded-lg h-full flex items-center justify-center">
                <div className="text-center">
                  <Globe className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-600 mb-2">
                    Carte interactive
                  </h4>
                  <p className="text-gray-500 mb-4">
                    Intégration avec Google Maps ou OpenStreetMap en cours
                  </p>

                  {/* Informations détaillées */}
                  <div className="bg-white rounded-lg p-4 max-w-md mx-auto">
                    <h5 className="font-medium text-gray-900 mb-3">Informations de suivi</h5>
                    <div className="space-y-2 text-sm">
                      {selectedItem && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Identifiant:</span>
                            <span className="font-medium">{selectedItem.vehicle || selectedItem.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Statut:</span>
                            <span className={`font-medium ${getStatusColor(selectedItem.status).split(' ')[0]}`}>
                              {selectedItem.status}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Localisation:</span>
                            <span className="font-medium">{selectedItem.location || 'GPS en cours'}</span>
                          </div>
                          {selectedItem.eta && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">ETA:</span>
                              <span className="font-medium">{selectedItem.eta}</span>
                            </div>
                          )}
                          {selectedItem.coordinates && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Coordonnées:</span>
                              <span className="font-medium text-xs">
                                {selectedItem.coordinates[0]?.toFixed(4)}, {selectedItem.coordinates[1]?.toFixed(4)}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={handleCloseMap}
                      className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
