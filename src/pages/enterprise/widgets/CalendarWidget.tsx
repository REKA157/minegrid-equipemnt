import { Widget } from '../types';
import { Calendar, Plus, User } from 'lucide-react';
import React from 'react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const CalendarWidget = ({ widget, data, onShowRentalForm, onUpdateStatus, onShowRentalDetails, onEditRental }: {
  widget: Widget;
  data: any[];
  onShowRentalForm: () => void;
  onUpdateStatus: (rentalId: string, status: string) => void;
  onShowRentalDetails: (rental: any) => void;
  onEditRental: (rental: any) => void;
}) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const rentalStatuses = ['Confirmée', 'En préparation', 'Prête', 'En cours', 'Terminée', 'Annulée'];

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getTimeIndicator = (daysUntilStart: number) => {
    if (daysUntilStart <= 0) return { text: 'Aujourd\'hui', color: 'text-red-600 font-semibold' };
    if (daysUntilStart === 1) return { text: 'Demain', color: 'text-orange-600 font-semibold' };
    if (daysUntilStart <= 3) return { text: `Dans ${daysUntilStart} jours`, color: 'text-yellow-600' };
    return { text: `Dans ${daysUntilStart} jours`, color: 'text-gray-600' };
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h3 className="font-semibold text-gray-800">{widget.title}</h3>
          <span className="ml-2 text-sm text-gray-500">({data.length})</span>
        </div>
        <button
          onClick={onShowRentalForm}
          className="p-2 text-orange-600 hover:bg-orange-100 rounded-full transition-colors"
          title="Ajouter une nouvelle location"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto flex-grow">
        {data.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>Aucune location à venir</p>
          </div>
        ) : (
          data.map((item) => {
            const timeIndicator = getTimeIndicator(item.daysUntilStart || 0);

            return (
              <div key={item.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-orange-300 transition-colors">
                {/* En-tête avec priorité et statut */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${getPriorityColor(item.priority)}`}></div>
                    <span className="text-sm font-medium text-gray-900">
                      {item.equipmentFullName || 'Équipement non spécifié'}
                    </span>
                  </div>
                  <select
                    value={item.status || 'Confirmée'}
                    onChange={(e) => onUpdateStatus(item.id, e.target.value)}
                    className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status)} focus:outline-none focus:ring-2 focus:ring-orange-500`}
                  >
                    {rentalStatuses.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                {/* Informations client et dates */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <User className="h-4 w-4 mr-1" />
                    <span>{item.clientName}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-600">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>{formatDate(item.start_date)} - {formatDate(item.end_date)}</span>
                    </div>
                    <span className={`text-xs ${timeIndicator.color}`}>
                      {timeIndicator.text}
                    </span>
                  </div>
                </div>

                {/* Informations financières et durée */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <div className="text-sm">
                    <span className="text-gray-600">Durée: </span>
                    <span className="font-medium">{item.durationDays} jours</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(item.total_price)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {formatCurrency(item.pricePerDay)}/jour
                    </div>
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-gray-200">
                  <button
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                    onClick={() => onShowRentalDetails(item)}
                  >
                    Voir détails
                  </button>
                  <button
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    onClick={() => onEditRental(item)}
                  >
                    Modifier
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
