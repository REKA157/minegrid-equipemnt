import React, { useState } from 'react';

export const EquipmentAvailabilityWidget = ({ data }: { data: any }) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  if (!data) {
    return (
      <div className="text-center text-gray-500 py-4">
        <div className="text-sm">Aucune donnée disponible</div>
        <div className="text-xs mt-1">Vérifiez la connexion à la base de données</div>
      </div>
    );
  }

  // Vérifier si les données ont la structure attendue
  // Accepter soit data.details soit data directement si c'est un tableau
  let details = [];
  let summary = [];
  let stats = { total: 0, available: 0, rented: 0, maintenance: 0, averageUsageRate: 0 };

  if (data.details && Array.isArray(data.details)) {
    // Structure attendue avec details, summary, stats
    details = data.details;
    summary = data.summary || [];
    stats = data.stats || { total: 0, available: 0, rented: 0, maintenance: 0, averageUsageRate: 0 };
  } else if (Array.isArray(data)) {
    // Si data est directement un tableau, le traiter comme details
    details = data;
    // Générer summary et stats à partir des données
    const total = details.length;
    const available = details.filter((item: any) => item.status === 'Disponible').length;
    const rented = details.filter((item: any) => item.status === 'En location').length;
    const maintenance = details.filter((item: any) => item.status === 'Maintenance').length;
    const averageUsageRate = details.length > 0 ?
      Math.round(details.reduce((sum: number, item: any) => sum + (item.usageRate || 0), 0) / details.length) : 0;

    summary = [
      { name: 'Disponible', value: available, color: 'green' },
      { name: 'En location', value: rented, color: 'orange' },
      { name: 'Maintenance', value: maintenance, color: 'red' }
    ];
    stats = { total, available, rented, maintenance, averageUsageRate };
  } else {
    console.error('[DEBUG] Structure de données incorrecte:', data);
    return (
      <div className="text-center text-red-600 py-4">
        <div className="text-sm">Erreur de structure des données</div>
        <div className="text-xs mt-1">Contactez l'administrateur</div>
      </div>
    );
  }

  // Vérifier si on a des équipements
  if (details.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <div className="text-sm">Aucun équipement trouvé</div>
        <div className="text-xs mt-1">
          <button
            onClick={() => window.location.reload()}
            className="text-orange-600 hover:text-orange-700 underline"
          >
            Recharger les données
          </button>
        </div>
      </div>
    );
  }

  const filteredEquipment = details.filter((equipment: any) => {
    const matchesStatus = selectedStatus === 'all' || equipment.status === selectedStatus;
    const matchesSearch = equipment.equipmentFullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         equipment.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         equipment.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         equipment.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string, color: string) => {
    const colorClasses = {
      green: 'bg-green-100 text-green-800 border-green-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
      red: 'bg-red-100 text-red-800 border-red-200'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[color as keyof typeof colorClasses]}`}>
        {status}
      </span>
    );
  };

  const getUsageBar = (usageRate: number) => {
    const color = usageRate > 80 ? 'bg-red-500' : usageRate > 50 ? 'bg-orange-500' : 'bg-green-500';
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${usageRate}%` }}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Statistiques globales */}
      <div className="grid grid-cols-4 gap-3">
        {summary.map((stat: any, index: number) => (
          <div key={index} className="text-center p-3 bg-gray-50 rounded-lg">
            <div className={`text-2xl font-bold text-${stat.color}-600`}>
              {stat.value}
        </div>
            <div className="text-xs text-gray-600">{stat.name}</div>
            </div>
        ))}
            </div>

      {/* Métriques supplémentaires */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <span>Total: {stats.total} équipements</span>
        <span>Taux d'utilisation moyen: {stats.averageUsageRate}%</span>
      </div>

      {/* Filtres et recherche */}
      <div className="flex gap-2">
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="all">Tous les statuts</option>
          <option value="Disponible">Disponible</option>
          <option value="En location">En location</option>
          <option value="Maintenance">Maintenance</option>
        </select>

        <input
          type="text"
          placeholder="Rechercher un équipement..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Liste des équipements */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredEquipment.map((equipment: any, index: number) => (
          <div key={equipment.id || index} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm text-gray-900 truncate">
                    {equipment.equipmentFullName}
                  </h4>
                  {getStatusBadge(equipment.status, equipment.statusColor)}
                </div>

                <div className="text-xs text-gray-600 space-y-1">
                  <div>Année: {equipment.year || 'N/A'}</div>
                  <div>Condition: {equipment.condition || 'N/A'}</div>
                  <div className="flex items-center gap-2">
                    <span>Utilisation:</span>
                    <div className="flex-1 max-w-20">
                      {getUsageBar(equipment.usageRate)}
              </div>
                    <span className="text-xs">{equipment.usageRate}%</span>
                </div>
                </div>

                {/* Informations de location ou maintenance */}
                {equipment.currentRental && (
                  <div className="mt-2 p-2 bg-orange-50 rounded text-xs">
                    <div className="font-medium text-orange-800">Location en cours</div>
                    <div className="text-orange-600">
                      Du {new Date(equipment.currentRental.startDate).toLocaleDateString()}
                      au {new Date(equipment.currentRental.endDate).toLocaleDateString()}
                </div>
              </div>
                )}

                {equipment.currentIntervention && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                    <div className="font-medium text-red-800">Maintenance programmée</div>
                    <div className="text-red-600">
                      {new Date(equipment.currentIntervention.scheduledDate).toLocaleDateString()}
                </div>
                </div>
                )}
                </div>

              {/* Action RÉELLE : ouvrir la fiche machine pour gérer (prix, statut, location). */}
              <div className="ml-3 flex items-center">
                <a
                  href={`#machines/${equipment.id}`}
                  className="whitespace-nowrap text-xs font-medium text-orange-700 hover:underline"
                >
                  Gérer →
                </a>
                </div>
              </div>
                </div>
        ))}
                </div>

      {/* Message si aucun résultat */}
      {filteredEquipment.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          <div className="text-sm">Aucun équipement trouvé</div>
                  </div>
                )}
    </div>
  );
};
