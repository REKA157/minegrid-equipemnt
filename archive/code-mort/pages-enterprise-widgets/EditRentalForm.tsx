import React, { useState } from 'react';
import { useWidgetMadCurrency } from '../../../hooks/useWidgetMadCurrency';

export const EditRentalForm = ({
  rental,
  onClose,
  onSubmit,
  equipment
}: {
  rental: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  equipment: any[];
}) => {
  const { formatCurrency } = useWidgetMadCurrency();
  const [formData, setFormData] = useState({
    equipment_id: rental.equipment_id || '',
    client_name: rental.clientName || 'Client Test',
    client_id: rental.client_id || 'c8e1a4b2-4d7a-4c28-9a4d-5d9f3b7b1e1a',
    start_date: rental.start_date ? rental.start_date.split('T')[0] : '',
    end_date: rental.end_date ? rental.end_date.split('T')[0] : '',
    total_price: rental.total_price || 0,
    status: rental.status || 'Confirmée'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <h4 className="font-medium text-blue-900 mb-2">Informations actuelles</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-blue-700">Équipement:</span>
            <p className="font-medium">{rental.equipmentFullName}</p>
          </div>
          <div>
            <span className="text-blue-700">Client:</span>
            <p className="font-medium">{rental.clientName}</p>
          </div>
          <div>
            <span className="text-blue-700">Prix total:</span>
            <p className="font-medium">{formatCurrency(rental.total_price)}</p>
          </div>
          <div>
            <span className="text-blue-700">Durée:</span>
            <p className="font-medium">{rental.durationDays} jours</p>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700">Statut</label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
        >
          <option value="Confirmée">Confirmée</option>
          <option value="En préparation">En préparation</option>
          <option value="Prête">Prête</option>
          <option value="En cours">En cours</option>
          <option value="Terminée">Terminée</option>
          <option value="Annulée">Annulée</option>
        </select>
      </div>

      <div>
        <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">Date de début</label>
        <input
          type="date"
          id="start_date"
          name="start_date"
          value={formData.start_date}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">Date de fin</label>
        <input
          type="date"
          id="end_date"
          name="end_date"
          value={formData.end_date}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="total_price" className="block text-sm font-medium text-gray-700">Prix total (€)</label>
        <input
          type="number"
          id="total_price"
          name="total_price"
          value={formData.total_price}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors"
        >
          Mettre à jour la location
        </button>
      </div>
    </form>
  );
};
