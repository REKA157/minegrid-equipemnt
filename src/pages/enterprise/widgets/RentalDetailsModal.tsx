import { X } from 'lucide-react';
import React from 'react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const RentalDetailsModal = ({ rental, onClose }: { rental: any; onClose: () => void }) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'En cours': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Confirmée': return 'bg-green-100 text-green-800 border-green-200';
      case 'Prête': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'En préparation': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Terminée': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'Annulée': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Détails de la Location</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Informations générales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Informations Générales</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Équipement</label>
                  <p className="text-sm text-gray-900">{rental.equipmentFullName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Client</label>
                  <p className="text-sm text-gray-900">{rental.clientName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Statut</label>
                  <span className={`inline-block px-2 py-1 text-xs rounded-full border ${getStatusColor(rental.status)}`}>
                    {rental.status}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Priorité</label>
                  <p className="text-sm text-gray-900 capitalize">{rental.priority}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Période de Location</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Date de début</label>
                  <p className="text-sm text-gray-900">{formatDate(rental.start_date)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Date de fin</label>
                  <p className="text-sm text-gray-900">{formatDate(rental.end_date)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Durée totale</label>
                  <p className="text-sm text-gray-900">{rental.durationDays} jours</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Temps restant</label>
                  <p className="text-sm text-gray-900">
                    {rental.daysUntilStart <= 0 ? 'Aujourd\'hui' :
                     rental.daysUntilStart === 1 ? 'Demain' :
                     `Dans ${rental.daysUntilStart} jours`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Informations financières */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informations Financières</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="text-sm font-medium text-gray-600">Prix total</label>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(rental.total_price)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="text-sm font-medium text-gray-600">Prix par jour</label>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(rental.pricePerDay)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="text-sm font-medium text-gray-600">Durée</label>
                <p className="text-lg font-semibold text-gray-900">{rental.durationDays} jours</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Actions</h3>
            <div className="flex space-x-3">
              <button className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors">
                Modifier la location
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                Générer facture
              </button>
              <button className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                Envoyer rappel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
