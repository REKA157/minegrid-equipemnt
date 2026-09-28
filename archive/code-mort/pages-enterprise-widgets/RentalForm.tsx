import React, { useState } from 'react';

export const RentalForm = ({
  onClose,
  onSubmit,
  equipment
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  equipment: any[];
}) => {
  const [formData, setFormData] = useState({
    equipment_id: '',
    client_name: 'Client Test', // Champ client simplifié pour l'instant
    client_id: 'c8e1a4b2-4d7a-4c28-9a4d-5d9f3b7b1e1a', // ID Client Test en dur
    start_date: '',
    end_date: '',
    total_price: 0
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
      <div>
        <label htmlFor="equipment_id" className="block text-sm font-medium text-gray-700">Équipement</label>
        <select id="equipment_id" name="equipment_id" value={formData.equipment_id} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm">
          <option value="">Sélectionnez un équipement</option>
          {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">Date de début</label>
        <input type="date" id="start_date" name="start_date" value={formData.start_date} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"/>
      </div>
      <div>
        <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">Date de fin</label>
        <input type="date" id="end_date" name="end_date" value={formData.end_date} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"/>
      </div>
      <div>
        <label htmlFor="total_price" className="block text-sm font-medium text-gray-700">Prix total (€)</label>
        <input type="number" id="total_price" name="total_price" value={formData.total_price} onChange={handleChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"/>
      </div>
      <div className="flex justify-end space-x-3">
        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">Annuler</button>
        <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700">Créer la location</button>
      </div>
    </form>
  );
};
